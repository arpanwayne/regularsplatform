import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Grants platform-wide SUPER_ADMIN access to an existing user by email.
// Deliberately a server-side CLI script, not an API route or UI button —
// there is no self-service way to become a super admin, since that would
// be a privilege-escalation hole. Run with:
//   npm run admin:promote -- owner@example.com
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run admin:promote -- <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}. They must sign up first.`);
    process.exit(1);
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "SUPER_ADMIN" } });
  console.log(`${email} is now a SUPER_ADMIN. They can access /admin right away (no re-login needed — role is read fresh from the DB on every request).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
