import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { runSegmentationForBusiness } from "../lib/run-segmentation";

const prisma = new PrismaClient();

// Demo data for a salon and a clinic so the dashboard is meaningful before
// any real WhatsApp traffic arrives. Run with `npm run db:seed`.
async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const salonOwner = await prisma.user.upsert({
    where: { email: "owner@glow-salon.demo" },
    update: {},
    create: {
      name: "Priya Sharma",
      email: "owner@glow-salon.demo",
      passwordHash,
      businesses: { create: { name: "Glow Salon & Spa", sector: "SALON" } },
    },
    include: { businesses: true },
  });

  const clinicOwner = await prisma.user.upsert({
    where: { email: "owner@wellness-clinic.demo" },
    update: {},
    create: {
      name: "Dr. Arjun Mehta",
      email: "owner@wellness-clinic.demo",
      passwordHash,
      businesses: { create: { name: "Wellness Family Clinic", sector: "CLINIC" } },
    },
    include: { businesses: true },
  });

  const salon = salonOwner.businesses[0];
  const clinic = clinicOwner.businesses[0];

  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  const demoCustomers = [
    // salon
    { businessId: salon.id, phone: "919810000001", name: "Anjali Verma", visitCount: 8, totalSpend: 12000, lastSeenAt: daysAgo(5) },
    { businessId: salon.id, phone: "919810000002", name: "Rohit Kapoor", visitCount: 5, totalSpend: 4200, lastSeenAt: daysAgo(45) },
    { businessId: salon.id, phone: "919810000003", name: "Sneha Iyer", visitCount: 12, totalSpend: 18000, lastSeenAt: daysAgo(80) },
    { businessId: salon.id, phone: "919810000004", name: "Karan Malhotra", visitCount: 1, totalSpend: 800, lastSeenAt: daysAgo(2) },
    // clinic
    { businessId: clinic.id, phone: "919820000001", name: "Meena Joshi", visitCount: 6, totalSpend: 9000, lastSeenAt: daysAgo(10) },
    { businessId: clinic.id, phone: "919820000002", name: "Vikram Rao", visitCount: 4, totalSpend: 3000, lastSeenAt: daysAgo(35) },
    { businessId: clinic.id, phone: "919820000003", name: "Divya Nair", visitCount: 9, totalSpend: 15000, lastSeenAt: daysAgo(70) },
    { businessId: clinic.id, phone: "919820000004", name: "Aditya Kumar", visitCount: 1, totalSpend: 500, lastSeenAt: daysAgo(1) },
  ];

  for (const c of demoCustomers) {
    await prisma.customer.upsert({
      where: { businessId_phone: { businessId: c.businessId, phone: c.phone } },
      update: c,
      create: { ...c, firstSeenAt: daysAgo(c.visitCount * 20) },
    });
  }

  await runSegmentationForBusiness(salon.id);
  await runSegmentationForBusiness(clinic.id);

  console.log("Seeded demo data:");
  console.log("  Salon login: owner@glow-salon.demo / password123");
  console.log("  Clinic login: owner@wellness-clinic.demo / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
