import { randomBytes, createHash } from "crypto";

// Separate from lib/auth.ts on purpose: that file is imported by
// middleware.ts, which runs on the Edge Runtime and can't bundle Node's
// 'crypto' module. These helpers are only used in server-only API routes
// (forgot/reset-password), so isolating them here keeps middleware's
// dependency graph edge-safe.
//
// The raw token goes in the emailed/logged link, only its hash is stored
// (PasswordResetToken.tokenHash) — so a DB read alone never yields a usable
// token, same principle as storing password hashes.
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
