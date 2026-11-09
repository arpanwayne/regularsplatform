import type { Business, ToolAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
import { logEvent } from "@/lib/logger";
import { getSettings, parseJson } from "@/lib/growth/settings";
import { TOOLS, TOOL_META, bundleLive, planTools, type Tool } from "@/lib/hub/plans";
import { signHubToken, toolSecret, toolUrl } from "@/lib/hub/tokens";

/**
 * Automatic connection: creates (or updates) the business's account in every
 * tool its plan includes, and pauses it in tools the plan no longer includes.
 * Idempotent — safe to run on every payment, plan change, lapse or retry.
 *
 * Contract (same for all four tools):
 *   POST {TOOL_API_URL}{PATH[tool]}
 *   Authorization: Bearer <hub JWT, purpose "provision">
 *   { hubBusinessId, active, paidUntil, plan, business{…}, owner{…}, regulars? {baseUrl, apiKey?, locationId} }
 *   → 200 { accountId, status: "ACTIVE"|"PAUSED", data{…}, secrets? { callbackKey } }
 *
 * The tool answers the same account for the same hubBusinessId every time.
 */
export const PATH: Record<Tool, string> = {
  WAYNERING: "/api/hub/provision",
  FIELD_SERVICE: "/api/v1/hub/provision",
  GMB: "/api/hub/provision",
  VIDEO: "/api/v1/hub/provision",
};
/** Tools that report events back into Regulars and so get an rk_live_ key. */
const REPORTS_EVENTS: Tool[] = ["WAYNERING", "FIELD_SERVICE"];
export const MAX_ATTEMPTS = 8;

type Answer = { accountId: string; status: "ACTIVE" | "PAUSED"; data?: Record<string, unknown>; secrets?: { callbackKey?: string } };

export type ProvisionResult = { tool: Tool; ok: boolean; status: string; error?: string; skipped?: string };

type Biz = Business & { owner: { name: string; email: string }; locations: { id: string }[] };

async function post(tool: Tool, url: string, token: string, body: unknown): Promise<Answer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? data.detail ?? data.message ?? `HTTP ${res.status}`));
    if (typeof data.accountId !== "string") throw new Error(`${TOOL_META[tool].name} answered without an accountId`);
    return data as unknown as Answer;
  } finally {
    clearTimeout(timer);
  }
}

export async function provisionTool(biz: Biz, tool: Tool, opts: { active: boolean; rotateKey?: boolean }): Promise<ProvisionResult> {
  const api = toolUrl(tool, "api");
  if (!api || !toolSecret(tool)) {
    return { tool, ok: false, status: "PENDING", skipped: `${TOOL_META[tool].apiEnv} or ${TOOL_META[tool].secretEnv} not set` };
  }
  const settings = await getSettings(biz);
  const existing = await prisma.toolAccount.upsert({
    where: { businessId_tool: { businessId: biz.id, tool } },
    create: { businessId: biz.id, tool },
    update: {},
  });

  // A fresh Regulars key for tools that send events, only when they don't
  // have one yet (or on a deliberate rotate). The plaintext leaves once.
  let issued: { id: string; plain: string } | null = null;
  if (opts.active && REPORTS_EVENTS.includes(tool) && (!existing.apiKeyId || opts.rotateKey)) {
    const k = generateApiKey();
    const row = await prisma.apiKey.create({ data: { businessId: biz.id, name: `Hub: ${TOOL_META[tool].name}`, keyHash: k.keyHash, keyPrefix: k.keyPrefix } });
    issued = { id: row.id, plain: k.plain };
  }

  const body = {
    hubBusinessId: biz.id,
    active: opts.active,
    paidUntil: biz.bundlePaidUntil?.toISOString() ?? null,
    plan: biz.frontDeskPlan,
    business: { name: biz.name, sector: biz.sector, country: biz.country, timezone: settings.timezone, phone: settings.ownerPhone },
    owner: { name: biz.owner.name, email: biz.owner.email, phone: settings.ownerPhone },
    regulars: REPORTS_EVENTS.includes(tool)
      ? { baseUrl: (process.env.APP_URL ?? "").replace(/\/$/, "") || null, apiKey: issued?.plain ?? null, locationId: biz.locations[0]?.id ?? null }
      : undefined,
    growth: { missedCallTextBack: biz.frontDeskPlan === "ANSWER_RETURN" || biz.frontDeskPlan === "GROW" },
  };

  try {
    const token = await signHubToken(tool, "provision", biz.id);
    const answer = await post(tool, `${api}${PATH[tool]}`, token, body);

    if (issued && existing.apiKeyId && existing.apiKeyId !== issued.id) {
      await prisma.apiKey.update({ where: { id: existing.apiKeyId }, data: { revokedAt: new Date() } }).catch(() => {});
    }
    await prisma.toolAccount.update({
      where: { id: existing.id },
      data: {
        status: answer.status === "PAUSED" ? "PAUSED" : "ACTIVE",
        externalId: answer.accountId,
        data: JSON.stringify(answer.data ?? {}),
        apiKeyId: issued?.id ?? existing.apiKeyId,
        lastError: null, attempts: 0, provisionedAt: new Date(),
      },
    });
    await wireGrowthSettings(biz.id, tool, answer, api);
    return { tool, ok: true, status: answer.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (issued) await prisma.apiKey.update({ where: { id: issued.id }, data: { revokedAt: new Date() } }).catch(() => {});
    await prisma.toolAccount.update({
      where: { id: existing.id },
      data: { status: existing.status === "ACTIVE" && opts.active ? "ACTIVE" : "FAILED", lastError: message.slice(0, 500), attempts: { increment: 1 } },
    });
    await logEvent({ businessId: biz.id, source: "BILLING", level: "ERROR", message: `Set-up in ${TOOL_META[tool].name} failed`, meta: { error: message } });
    return { tool, ok: false, status: "FAILED", error: message };
  }
}

/** Point the Growth Manager's connectors at the accounts that were just made. */
async function wireGrowthSettings(businessId: string, tool: Tool, a: Answer, api: string) {
  const data: Record<string, string> = {};
  if (tool === "WAYNERING") {
    data.wayneRingBaseUrl = api;
    if (a.secrets?.callbackKey) data.wayneRingCallbackKey = a.secrets.callbackKey;
  }
  if (tool === "GMB" && typeof a.data?.locationId === "string") data.gmbLocationId = a.data.locationId;
  if (tool === "VIDEO") data.videoStudioClientId = String(a.data?.clientId ?? a.accountId);
  if (Object.keys(data).length) await prisma.growthSettings.update({ where: { businessId }, data });
}

/** Provision every tool: on for the plan's tools, paused for the rest it already has. */
export async function provisionBusiness(businessId: string, opts: { rotateKeys?: boolean } = {}): Promise<ProvisionResult[]> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    include: { owner: { select: { name: true, email: true } }, locations: { select: { id: true }, orderBy: { createdAt: "asc" } }, toolAccounts: true },
  });
  if (!biz) return [];
  const live = bundleLive(biz) && biz.status !== "SUSPENDED";
  const wanted = new Set(planTools(biz.frontDeskPlan));
  const results: ProvisionResult[] = [];
  for (const tool of TOOLS) {
    const has = biz.toolAccounts.find((t) => t.tool === tool);
    if (wanted.has(tool)) results.push(await provisionTool(biz, tool, { active: live, rotateKey: opts.rotateKeys }));
    else if (has && has.status !== "PAUSED" && has.externalId) results.push(await provisionTool(biz, tool, { active: false }));
  }
  return results;
}

/** Cron: retry failed or never-finished set-ups with backoff (1h, 2h, 4h… capped). */
export async function retryProvisioning(now = new Date()) {
  const due = await prisma.toolAccount.findMany({
    where: { status: { in: ["FAILED", "PENDING"] }, attempts: { lt: MAX_ATTEMPTS }, business: { bundleStatus: { in: ["ACTIVE", "LAPSED"] } } }, // a failed pause must be retried too
    select: { businessId: true, attempts: true, updatedAt: true },
  });
  const ready = due.filter((t) => now.getTime() - t.updatedAt.getTime() >= Math.min(2 ** t.attempts, 24) * 3600000 - 60000);
  const ids = Array.from(new Set(ready.map((t) => t.businessId)));
  for (const id of ids) await provisionBusiness(id);
  return ids.length;
}

export function accountData<T = Record<string, unknown>>(t: Pick<ToolAccount, "data"> | undefined | null): T {
  return parseJson<T>(t?.data ?? "{}", {} as T);
}
