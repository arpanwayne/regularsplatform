import { allMetaTemplates, type WaLang, type WaTemplateKey } from "@/lib/whatsapp-templates";

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
      key: t.key, lang: t.lang, name: t.name, language: t.language, category: t.category, body: t.components[0].text,
      metaStatus: m?.status ?? null, metaCategory: m?.category ?? null, rejectedReason: m?.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : null,
    };
  });
}

export type SubmitResult = { name: string; language: string; result: "SUBMITTED" | "ALREADY_THERE" | "FAILED"; status?: string; error?: string };

/**
 * Creates every template that isn't in the account yet. Existing ones are
 * left alone (Meta doesn't allow editing an approved template's body here;
 * to change one, delete it in WhatsApp Manager and submit again).
 */
export async function submitAllTemplates(wabaId: string, token: string): Promise<SubmitResult[]> {
  const existing = new Set((await listMetaTemplates(wabaId, token)).map((m) => `${m.name}|${m.language}`));
  const results: SubmitResult[] = [];
  for (const t of allMetaTemplates()) {
    if (existing.has(`${t.name}|${t.language}`)) {
      results.push({ name: t.name, language: t.language, result: "ALREADY_THERE" });
      continue;
    }
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components: t.components }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } };
    results.push(res.ok
      ? { name: t.name, language: t.language, result: "SUBMITTED", status: data.status }
      : { name: t.name, language: t.language, result: "FAILED", error: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}` });
  }
  return results;
}
