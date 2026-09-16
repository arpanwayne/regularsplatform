import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { hashPassword } from "@/lib/auth";

// Admin-initiated password reset for an owner who's lost access to their
// email (so the usual "forgot password" email flow isn't an option here —
// there isn't one built, and this is the documented workaround). Returns
// the new temporary password ONCE in the response; it is never stored or
// logged in plaintext anywhere — the admin must relay it to the owner
// out-of-band (phone call, in person) and the owner should change it after
// logging in (no self-service change-password UI exists yet either — see
// README roadmap).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const owner = await prisma.user.findUnique({ where: { id: params.id } });
  if (!owner || owner.role !== "OWNER") {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }

  const tempPassword = randomBytes(9).toString("base64url"); // 12-char, URL-safe
  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({ where: { id: owner.id }, data: { passwordHash } });

  return NextResponse.json({ tempPassword });
}
