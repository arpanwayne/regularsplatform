import { PrismaClient } from "@prisma/client";
import { touchesSyncFields } from "@/lib/customer-sync-rules";
import { syncSuppressed } from "@/lib/sync-context";

// Reuse a single PrismaClient across hot reloads in dev so we don't exhaust
// the SQLite/Postgres connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const client = new PrismaClient();
  installCustomerSyncHook(client);
  return client;
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Loopdesk ⇄ Regulars customer sync (bug list 28 Nov 2026, A1/B5): any
 * customer write that touches a synced field (name, phone, STOP, consent…)
 * marks the row syncPending; lib/hub-sync.ts sends pending rows to Loopdesk a
 * moment later. Catches every place that writes customers (add, import, QR
 * join, YES/NO, STOP, Instagram, front desk…), not just the ones we remember.
 */
const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
function installCustomerSyncHook(client: PrismaClient) {
  client.$use(async (params, next) => {
    // New messages (inbox both ways): copied to the other app with the customers.
    if (params.model === "Message" && (params.action === "create" || params.action === "createMany") && !syncSuppressed()) {
      const args = (params.args ?? {}) as { data?: unknown };
      const mark = (d: Record<string, unknown>) => (d && !d.syncOrigin && (d.channel ?? "WHATSAPP") !== "INSTAGRAM" ? { ...d, syncPending: true } : d);
      args.data = Array.isArray(args.data) ? args.data.map(mark) : mark(args.data as Record<string, unknown>);
      params.args = args;
      const result = await next(params);
      import("@/lib/hub-sync").then((m) => m.scheduleHubSync()).catch(() => {});
      return result;
    }
    if (params.model !== "Customer" || !WRITES.has(params.action) || syncSuppressed()) return next(params);
    const now = new Date();
    const mark = (data: unknown) => (touchesSyncFields(data) || params.action === "create" || params.action === "createMany")
      ? { ...(data as Record<string, unknown>), syncPending: true, syncChangedAt: now }
      : data;
    const args = (params.args ?? {}) as Record<string, unknown>;
    let marked = false;
    if (params.action === "upsert") {
      args.create = { ...(args.create as Record<string, unknown>), syncPending: true, syncChangedAt: now };
      if (touchesSyncFields(args.update)) args.update = mark(args.update);
      marked = true;
    } else if (params.action === "createMany") {
      args.data = (Array.isArray(args.data) ? args.data : [args.data]).map(mark);
      marked = true;
    } else if (args.data && (params.action === "create" || touchesSyncFields(args.data))) {
      args.data = mark(args.data);
      marked = true;
    }
    params.args = args;
    const result = await next(params);
    if (marked) {
      // Lazy: lib/hub-sync imports this file.
      import("@/lib/hub-sync").then((m) => m.scheduleHubSync()).catch(() => {});
    }
    return result;
  });
}
