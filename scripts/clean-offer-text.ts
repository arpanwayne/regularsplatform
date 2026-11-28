/**
 * Bug list 28 Nov 2026, B2: offers whose saved message starts with a piece of
 * the list summary ("20% off): …" or "Title (20% off): …"). Shows them, and with
 * --yes saves the clean message. Offers already sent are only cleaned in the list;
 * nothing is sent again.
 *   npx tsx scripts/clean-offer-text.ts          # shows what would change
 *   npx tsx scripts/clean-offer-text.ts --yes    # saves it
 */
import "./load-env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const yes = process.argv.includes("--yes");

export function cleanOfferMessage(title: string, message: string): string {
  let m = message.trim();
  const t = title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (t) m = m.replace(new RegExp(`^${t}\\s*\\([^)]*\\)\\s*:\\s*`, "i"), "");
  m = m.replace(/^\(?\s*\d{1,3}\s*% off[^):]*\)?\s*:\s*/i, "");
  m = m.replace(/^free item\/points\)?\s*:\s*/i, "");
  return m.trim();
}

(async () => {
  const offers = await prisma.offer.findMany({ select: { id: true, approvalNo: true, title: true, message: true, business: { select: { name: true } } } });
  const fix = offers.map((o) => ({ ...o, clean: cleanOfferMessage(o.title, o.message) })).filter((o) => o.clean !== o.message.trim() && o.clean.length >= 5);
  for (const o of fix) console.log(`${o.business.name} #${o.approvalNo}: "${o.message.slice(0, 60)}" → "${o.clean.slice(0, 60)}"`);
  if (!fix.length) { console.log("No offer messages need cleaning."); return; }
  if (!yes) { console.log(`\n${fix.length} offer(s). Nothing changed. Run again with --yes to save.`); return; }
  for (const o of fix) await prisma.offer.update({ where: { id: o.id }, data: { message: o.clean } });
  console.log(`\nCleaned ${fix.length} offer message(s).`);
})().finally(() => prisma.$disconnect());
