/**
 * One-off clean-up (Regulars retest 27 Nov 2026, bugs 10 + 17): clears a
 * WhatsApp "Phone number ID" that isn't digits (a browser-autofilled login
 * email, e.g. pavnoor@gmail.com) and its token, on every location.
 * Settings also does this by itself when the owner opens it; this does all at once.
 *   npx tsx scripts/clear-bad-whatsapp-ids.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.location.findMany({ where: { whatsappPhoneNumberId: { not: null } }, select: { id: true, name: true, whatsappPhoneNumberId: true } });
  const bad = rows.filter((l) => !/^\d{1,25}$/.test(String(l.whatsappPhoneNumberId).trim()));
  if (bad.length) await prisma.location.updateMany({ where: { id: { in: bad.map((l) => l.id) } }, data: { whatsappPhoneNumberId: null, whatsappAccessToken: null } });
  console.log(`Checked ${rows.length} location(s); cleared ${bad.length}${bad.length ? `: ${bad.map((l) => l.name).join(", ")}` : ""}.`);
})().finally(() => prisma.$disconnect());
