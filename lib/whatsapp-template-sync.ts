import { allMetaTemplates, type WaHeader, type WaLang, type WaTemplateKey } from "@/lib/whatsapp-templates";

/**
 * Submits our templates (lib/whatsapp-templates.ts) to a WhatsApp Business
 * Account and reads back Meta's approval status. No Prisma — used by the
 * admin page and by `npm run wa:templates`.
 *
 * Meta reviews each template (usually minutes, sometimes up to a day).
 * Until a template is APPROVED, sends that need it fail and are logged.
 */

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;

export type MetaTemplateStatus = { name: string; language: string; status: string; category?: string; rejected_reason?: string };

export type TemplateRow = {
  key: WaTemplateKey; lang: WaLang; name: string; language: string; category: string; body: string;
  metaStatus: string | null; metaCategory: string | null; rejectedReason: string | null;
};

export async function listMetaTemplates(wabaId: string, token: string): Promise<MetaTemplateStatus[]> {
  const out: MetaTemplateStatus[] = [];
  let url: string | null = `${GRAPH}/${wabaId}/message_templates?fields=name,language,status,category,rejected_reason&limit=200`;
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as { data?: MetaTemplateStatus[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok) throw new Error(`Meta ${res.status}: ${data.error?.message ?? "could not list templates"}`);
    out.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return out;
}

/** Our templates joined with Meta's status for each (null = not submitted). */
export function mergeStatus(meta: MetaTemplateStatus[]): TemplateRow[] {
  const byKey = new Map(meta.map((m) => [`${m.name}|${m.language}`, m]));
  return allMetaTemplates().map((t) => {
    const m = byKey.get(`${t.name}|${t.language}`);
    return {
      key: t.key, lang: t.lang, name: t.name, language: t.language, category: t.category, body: (t.header ? `[${t.header === "IMAGE" ? "Photo" : "Video"}] ` : "") + t.components[0].text,
      metaStatus: m?.status ?? null, metaCategory: m?.category ?? null, rejectedReason: m?.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : null,
    };
  });
}

/** A sample photo/video Meta shows its reviewers for a template with a media header. */
export type HeaderSample = { bytes: Uint8Array; mimeType: string; fileName: string };

/**
 * Meta wants header samples uploaded through its Resumable Upload API, which
 * needs the Meta app's id (WHATSAPP_APP_ID). Returns the upload handle.
 */
export async function uploadHeaderSample(appId: string, token: string, sample: HeaderSample): Promise<string> {
  const start = await fetch(`${GRAPH}/${appId}/uploads?file_name=${encodeURIComponent(sample.fileName)}&file_length=${sample.bytes.length}&file_type=${encodeURIComponent(sample.mimeType)}`, {
    method: "POST", headers: { authorization: `Bearer ${token}` },
  });
  const s = (await start.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!start.ok || !s.id) throw new Error(`Meta upload ${start.status}: ${s.error?.message ?? "could not start the upload"}`);
  const up = await fetch(`${GRAPH}/${s.id}`, {
    method: "POST", headers: { authorization: `OAuth ${token}`, file_offset: "0" }, body: Buffer.from(sample.bytes),
  });
  const u = (await up.json().catch(() => ({}))) as { h?: string; error?: { message?: string } };
  if (!up.ok || !u.h) throw new Error(`Meta upload ${up.status}: ${u.error?.message ?? "could not upload the sample"}`);
  return u.h;
}

export type SubmitResult = { name: string; language: string; result: "SUBMITTED" | "ALREADY_THERE" | "FAILED"; status?: string; error?: string };

/**
 * Creates every template that isn't in the account yet. Existing ones are
 * left alone (Meta doesn't allow editing an approved template's body here;
 * to change one, delete it in WhatsApp Manager and submit again).
 */
export async function submitAllTemplates(
  wabaId: string, token: string,
  samples: Partial<Record<WaHeader, HeaderSample>> = {}, appId = process.env.WHATSAPP_APP_ID,
): Promise<SubmitResult[]> {
  const existing = new Set((await listMetaTemplates(wabaId, token)).map((m) => `${m.name}|${m.language}`));
  const results: SubmitResult[] = [];
  const handles: Partial<Record<WaHeader, string | Error>> = {};
  for (const t of allMetaTemplates()) {
    if (existing.has(`${t.name}|${t.language}`)) {
      results.push({ name: t.name, language: t.language, result: "ALREADY_THERE" });
      continue;
    }
    let components: unknown[] = t.components;
    if (t.header) {
      const sample = samples[t.header];
      const why = !appId ? "set WHATSAPP_APP_ID (your Meta app's id) to submit photo/video templates"
        : !sample ? (t.header === "VIDEO" ? "upload one offer video first; it is used as Meta's sample" : "no sample photo found")
        : null;
      if (why) { results.push({ name: t.name, language: t.language, result: "FAILED", error: why }); continue; }
      if (!handles[t.header]) handles[t.header] = await uploadHeaderSample(appId!, token, sample!).catch((e) => (e instanceof Error ? e : new Error(String(e))));
      const h = handles[t.header]!;
      if (h instanceof Error) { results.push({ name: t.name, language: t.language, result: "FAILED", error: h.message }); continue; }
      components = t.components.map((c) => (c.type === "HEADER" ? { ...c, example: { header_handle: [h] } } : c));
    }
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
    results.push(res.ok
      ? { name: t.name, language: t.language, result: "SUBMITTED", status: data.status }
      : { name: t.name, language: t.language, result: "FAILED", error: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}` });
  }
  return results;
}
