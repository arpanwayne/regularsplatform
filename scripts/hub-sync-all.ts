/**
 * Bug list 28 Nov 2026, A1: first sync with Loopdesk AI after deploy. Marks
 * every customer of businesses linked to Loopdesk (dummy +91 98000 000xx
 * skipped) and sends them now. Loopdesk keeps what it has; new numbers are
 * added, empty names filled, STOP and consent merged (lib/customer-sync-rules.ts).
 * Run scripts/remove-dummy-customers.ts first. Safe to run again.
 *   npx tsx scripts/hub-sync-all.ts
 */
import "./load-env";
import { prisma } from "../lib/prisma";
import { flushHubSync, markAllForHubSync } from "../lib/hub-sync";
import { hubWhatsAppReady } from "../lib/whatsapp-sender";

(async () => {
  if (!hubWhatsAppReady()) { console.log("Loopdesk connection is not set in .env (LOOPDESK_API_URL and HUB_SECRET, 32+ characters). Nothing sent."); return; }
  const marked = await markAllForHubSync();
  console.log(`Marked ${marked} customer(s) of Loopdesk-linked businesses.`);
  const r = await flushHubSync();
  console.log(`Sent ${r.sent} to Loopdesk AI${r.failed ? `; ${r.failed} failed (see Admin → Logs; they go with the hourly cron)` : ""}.`);
})().finally(() => prisma.$disconnect());
