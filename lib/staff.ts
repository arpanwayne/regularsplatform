import type { Business, Location, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { normalizePhone, toE164 } from "@/lib/phone";
import { smsConfigured, twilioSend } from "@/lib/sms";
import { sendOwnerWhatsApp } from "@/lib/whatsapp-send";
import { addCustomerByStaff, parseStaffAdd, staffAddReply } from "@/lib/onboarding";
import { decideOffer, ownerPhones, parseApprovalReply } from "@/lib/offers";

/**
 * Messages from the business's own people to the business number:
 *   owner:   "APPROVE 7" / "REJECT 7"  → decides a manager's offer
 *   owner or manager: "add Rahul 9876543210" → adds a customer + YES/NO request
 * Checked by the WhatsApp and SMS webhooks before customer handling. The owner's
 * morning-plan replies ("1 3", ALL, SKIP) stay with lib/growth/brief.ts.
 */

type Staff = { role: "OWNER" } | { role: "MANAGER"; user: User };

export async function identifyStaff(business: Business & { locations: Location[] }, phone: string): Promise<Staff | null> {
  if ((await ownerPhones(business)).includes(phone)) return { role: "OWNER" };
  const managers = await prisma.user.findMany({ where: { role: "MANAGER", managedBusinessId: business.id, phone: { not: null } } });
  const user = managers.find((m) => normalizePhone(m.phone, business.country) === phone);
  return user ? { role: "MANAGER", user } : null;
}

/** Answer to the staff member, on the channel they wrote on (inside the 24h window — they just wrote). */
async function reply(business: Business, location: Location, to: string, text: string, channel: "WHATSAPP" | "SMS") {
  if (channel === "WHATSAPP") return sendOwnerWhatsApp(business, location, to, { text });
  if (!location.smsFromNumber || !smsConfigured()) return false;
  try {
    await twilioSend(location.smsFromNumber, toE164(to), text);
    return true;
  } catch (err) {
    await logEvent({ businessId: business.id, source: "SMS", level: "ERROR", message: "Reply to staff SMS failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return false;
  }
}

/** Reply to an owner who writes to the shared number with something that isn't a command. */
export const OWNER_NOT_INBOX =
  "Ye number aapke business ka hai, isliye aapke apne messages Inbox mein nahi aate. Customer ki tarah test karna ho to kisi doosre phone se QR scan karke message bhejein. Commands: APPROVE <no>, REJECT <no>, add <naam> <mobile>.";

export const MANAGER_HELP = "Hi! To add a customer, send: add <name> <mobile>, e.g. add Rahul 9876543210. Offers are written on the dashboard (Offers).";

/** True when the message was a staff command (or a manager writing in) and has been handled. */
export async function handleStaffMessage(location: Location & { business: Business }, fromRaw: string, text: string, channel: "WHATSAPP" | "SMS", now = new Date()) {
  const business = await prisma.business.findUnique({ where: { id: location.businessId }, include: { locations: true } });
  if (!business) return false;
  const phone = normalizePhone(fromRaw, business.country);
  if (!phone) return false;
  const staff = await identifyStaff(business, phone);
  if (!staff) return false;

  const approval = parseApprovalReply(text);
  if (approval && staff.role === "OWNER") {
    const pending = await prisma.offer.findMany({ where: { businessId: business.id, status: "PENDING_APPROVAL" }, orderBy: { approvalNo: "asc" } });
    const target = approval.no != null ? pending.find((o) => o.approvalNo === approval.no) : pending.length === 1 ? pending[0] : null;
    if (!target) {
      const msg = approval.no != null
        ? `There's no offer #${approval.no} waiting for approval.`
        : pending.length ? `${pending.length} offers are waiting: ${pending.map((o) => `#${o.approvalNo} ${o.title}`).join(", ")}. Reply APPROVE <number> or REJECT <number>.` : "No offers are waiting for approval.";
      await reply(business, location, phone, msg, channel);
      return true;
    }
    const r = await decideOffer(business, target.id, approval.decision, channel, now);
    const status = r.offer?.status;
    const msg = approval.decision === "REJECT"
      ? `Rejected offer #${target.approvalNo} (${target.title}). It won't be sent.`
      : status === "SENT" ? `Approved offer #${target.approvalNo}. Sent to ${r.offer!.sentCount} customers.`
      : `Approved offer #${target.approvalNo}. It goes out ${target.sendAt && target.sendAt > now ? "at the time your manager picked" : "in contact hours"}.`;
    await reply(business, location, phone, msg, channel);
    return true;
  }

  const add = parseStaffAdd(text, business.country);
  if (add) {
    if ("error" in add) {
      await reply(business, location, phone, add.error, channel);
      return true;
    }
    const r = await addCustomerByStaff(business, location, add, now);
    await reply(business, location, phone, staffAddReply(r, business.name), channel);
    return true;
  }

  // A manager chatting to the business number is not a customer.
  if (staff.role === "MANAGER") {
    await reply(business, location, phone, MANAGER_HELP, channel);
    return true;
  }
  return false; // the owner: may be a morning-plan reply, handled next
}
