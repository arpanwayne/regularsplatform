// Submit every WhatsApp template to Meta, or list their approval status.
//   npm run wa:templates            → submit the missing ones (shared number's account)
//   npm run wa:templates -- --list  → show status only
// Uses WHATSAPP_SHARED_WABA_ID and WHATSAPP_SHARED_ACCESS_TOKEN from the environment
// (on the server: run it from the app folder so .env is loaded by your shell / pm2).
import { listMetaTemplates, mergeStatus, submitAllTemplates } from "../lib/whatsapp-template-sync";

async function main() {
  const waba = process.env.WHATSAPP_SHARED_WABA_ID, token = process.env.WHATSAPP_SHARED_ACCESS_TOKEN;
  if (!waba || !token) {
    console.error("Set WHATSAPP_SHARED_WABA_ID and WHATSAPP_SHARED_ACCESS_TOKEN first.");
    process.exit(1);
  }
  if (!process.argv.includes("--list")) {
    for (const r of await submitAllTemplates(waba, token)) {
      console.log(`${r.result.padEnd(13)} ${r.name} (${r.language})${r.error ? `  ← ${r.error}` : ""}`);
    }
    console.log("");
  }
  const rows = mergeStatus(await listMetaTemplates(waba, token));
  for (const r of rows) console.log(`${(r.metaStatus ?? "NOT SUBMITTED").padEnd(13)} ${r.name} (${r.language})${r.rejectedReason ? `  ← ${r.rejectedReason}` : ""}`);
  console.log(`\n${rows.filter((r) => r.metaStatus === "APPROVED").length}/${rows.length} approved`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
