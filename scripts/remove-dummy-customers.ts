/**
 * Bug list 28 Nov 2026, A4: test numbers +91 98000 000xx (Aman, Simran, Karan,
 * Rohit, Neha) sit in the real Wayne E Solutions business, and Growth AI sends
 * win-backs to them. This removes them, with their messages, visits and
 * Growth AI actions / events, from every business except the demo ones.
 *
 *   npx tsx scripts/remove-dummy-customers.ts          # shows what would go
 *   npx tsx scripts/remove-dummy-customers.ts --yes    # removes it
 */
import "./load-env";
import { PrismaClient } from "@prisma/client";
import { isDummyPhone } from "../lib/customer-sync-rules";

const prisma = new PrismaClient();
const yes = process.argv.includes("--yes");

(async () => {
  const rows = await prisma.customer.findMany({
    where: { phone: { contains: "98000000" }, business: { NOT: { name: { contains: "Demo" } } } },
    select: { id: true, name: true, phone: true, business: { select: { name: true } }, _count: { select: { messages: true, growthActions: true } } },
  });
  const dummy = rows.filter((c) => isDummyPhone(c.phone));
  if (!dummy.length) { console.log("No dummy customers (+91 98000 000xx) found."); return; }
  for (const c of dummy) console.log(`${c.business.name}: ${c.name ?? "(no name)"} ${c.phone} — ${c._count.messages} message(s), ${c._count.growthActions} Growth AI action(s)`);
  if (!yes) { console.log(`\n${dummy.length} dummy customer(s). Nothing changed. Run again with --yes to remove them.`); return; }
  const ids = dummy.map((c) => c.id);
  const actions = await prisma.growthAction.deleteMany({ where: { customerId: { in: ids } } });
  const events = await prisma.growthEvent.deleteMany({ where: { customerId: { in: ids } } });
  const gone = await prisma.customer.deleteMany({ where: { id: { in: ids } } }); // messages, visits, calls go with them
  console.log(`\nRemoved ${gone.count} customer(s), ${actions.count} Growth AI action(s), ${events.count} event(s).`);
})().finally(() => prisma.$disconnect());
