"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adVideoStudioUrl } from "@/lib/offer-media";

/** Fired by the segment suggestions panel ("Use this offer"). */
export const USE_OFFER_EVENT = "regulars:use-offer";
export type UseOfferDetail = { title: string; message: string; discountPercent: number | null; segment: string };

type Media = { id: string; kind: "IMAGE" | "VIDEO"; previewUrl: string; name: string };

const SEGMENTS = [
  { id: "REGULAR", label: "Regulars" },
  { id: "HIGH_SPENDER", label: "High spenders" },
  { id: "NEW", label: "New" },
  { id: "AT_RISK", label: "At risk" },
  { id: "DORMANT", label: "Dormant" },
];

type Limits = { approvalMaxDiscount: number; approvalMaxAudience: number; approvalAutoFreebie: boolean };

export function OfferComposer({ isOwner, limits, loopdeskVideoUrl = null }: { isOwner: boolean; limits: Limits; loopdeskVideoUrl?: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [discount, setDiscount] = useState("");
  const [freebie, setFreebie] = useState(false);
  const [segments, setSegments] = useState<string[]>([]);
  const [sendAt, setSendAt] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaNote, setMediaNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [previousDraft, setPreviousDraft] = useState<{ title: string; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // "Use this offer" from the AI segment suggestions fills the form.
  useEffect(() => {
    const onUse = (e: Event) => {
      const d = (e as CustomEvent<UseOfferDetail>).detail;
      setTitle(d.title.slice(0, 80)); setMessage(d.message.slice(0, 500));
      setDiscount(d.discountPercent ? String(d.discountPercent) : ""); setSegments([d.segment]);
      setPreviousDraft(null); setResult(null);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(USE_OFFER_EVENT, onUse);
    return () => window.removeEventListener(USE_OFFER_EVENT, onUse);
  }, []);

  async function upload(file: File) {
    setUploading(true); setMediaNote(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/offers/media", { method: "POST", body: fd }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res?.ok) {
      setMediaNote({ ok: false, text: res?.status === 413 ? "That file is too big for the server. Ask your admin to raise the upload limit (Nginx client_max_body_size 20m)." : d.error || "Couldn't upload that file." });
      return;
    }
    setMedia({ id: d.media.id, kind: d.media.kind, previewUrl: d.previewUrl, name: file.name });
    if (d.warning) setMediaNote({ ok: false, text: d.warning });
  }

  async function rewrite() {
    setRewriting(true); setResult(null);
    const res = await fetch("/api/offers/rewrite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: message, title, discountPercent: discount ? Number(discount) : null, freebie, segments }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setRewriting(false);
    if (!res?.ok) { setResult({ ok: false, text: d.error || "Couldn't rewrite the offer." }); return; }
    setPreviousDraft({ title, message });
    setMessage(String(d.message).slice(0, 500));
    if (d.title) setTitle(String(d.title).slice(0, 80));
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/offers/audience?segments=${segments.join(",")}`).then((r) => r.json()).then((d) => { if (live) setAudience(typeof d.count === "number" ? d.count : null); }).catch(() => {});
    return () => { live = false; };
  }, [segments]);

  const pct = discount ? Number(discount) : 0;
  const needsOwner = !isOwner && (pct > limits.approvalMaxDiscount || (audience ?? 0) > limits.approvalMaxAudience || (freebie && !limits.approvalAutoFreebie));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, message, discountPercent: discount ? Number(discount) : null, freebie, segments, sendAt: sendAt ? new Date(sendAt).toISOString() : null, mediaId: media?.id ?? null }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setResult({ ok: false, text: d.error || "Couldn't save the offer." }); return; }
    setResult({
      ok: true,
      text: d.auto
        ? `Offer #${d.offer.approvalNo} is approved and goes to ${d.offer.audienceCount} customers in contact hours.`
        : `Offer #${d.offer.approvalNo} was sent to the owner's WhatsApp for approval (${d.reasons.join("; ")}).`,
    });
    setTitle(""); setMessage(""); setDiscount(""); setFreebie(false); setSendAt(""); setMedia(null); setMediaNote(null); setPreviousDraft(null);
    router.refresh();
  }

  const input = "w-full rounded-input border border-control px-3 py-2 text-sm";
  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3 rounded-card border border-gray-200 bg-white p-4 text-sm">
      <h2 className="font-medium">New offer</h2>
      <input className={input} placeholder="Title, e.g. Weekend hair spa offer" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      <textarea className={input} rows={3} placeholder="What customers read, e.g. 20% off any hair spa this Saturday and Sunday. Show this message at the counter." value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} required />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={rewrite} disabled={rewriting || message.trim().length < 5}
          className="rounded-full border border-brand-600 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50">
          {rewriting ? "Writing…" : "✨ Rewrite with AI"}
        </button>
        {previousDraft && (
          <button type="button" className="text-xs text-gray-500 underline" onClick={() => { setTitle(previousDraft.title); setMessage(previousDraft.message); setPreviousDraft(null); }}>
            Undo AI rewrite
          </button>
        )}
        <span className="text-xs text-gray-500">Write the basics (what, price, until when). AI makes it engaging and keeps your real details. Check it before sending.</span>
      </div>
      <p className="text-xs text-gray-500">It goes out as: &quot;Hi Priya, a special offer from your business: <i>your message</i> Reply STOP to stop these messages.&quot;</p>

      <div className="space-y-2 rounded-input border border-dashed border-gray-300 p-3">
        <p className="font-medium">Photo or video <span className="font-normal text-gray-500">(optional, shown above the offer on WhatsApp)</span></p>
        {media ? (
          <div className="flex items-center gap-3">
            {media.kind === "IMAGE"
              // eslint-disable-next-line @next/next/no-img-element -- user upload served by our API
              ? <img src={media.previewUrl} alt="Offer photo" className="h-20 w-20 rounded object-cover" />
              : <video src={media.previewUrl} className="h-20 w-32 rounded bg-black object-cover" controls muted />}
            <div className="min-w-0">
              <p className="truncate text-gray-700">{media.name}</p>
              <button type="button" className="text-xs text-red-600 underline" onClick={() => { setMedia(null); setMediaNote(null); }}>Remove</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`cursor-pointer rounded-full border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 ${uploading ? "opacity-60" : ""}`}>
              {uploading ? "Uploading…" : "Upload photo or video"}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            </label>
            <span className="text-xs text-gray-500">No photo?</span>
            <a href={loopdeskVideoUrl ?? adVideoStudioUrl([title, message].filter(Boolean).join(". "))} target="_blank" rel="noopener noreferrer"
              className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700">
              🎬 Make a promo video in Ad Video Studio
            </a>
          </div>
        )}
        {!media && <p className="text-xs text-gray-500">JPG/PNG up to 5 MB, or MP4 up to 16 MB. Made a video in Ad Video Studio? Download it there, then upload it here.</p>}
        {mediaNote && <p className={`text-xs ${mediaNote.ok ? "text-gray-600" : "text-amber-700"}`}>{mediaNote.text}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">Discount
          <input className="w-20 rounded-input border border-control px-2 py-1" type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /> %
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={freebie} onChange={(e) => setFreebie(e.target.checked)} /> Free item or bonus points</label>
        <label className="flex items-center gap-2">Send after
          <input className="rounded-input border border-control px-2 py-1" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-600">Who:</span>
        {SEGMENTS.map((s) => (
          <label key={s.id} className="flex items-center gap-1 rounded-full border border-gray-300 px-2 py-0.5">
            <input type="checkbox" checked={segments.includes(s.id)} onChange={(e) => setSegments(e.target.checked ? [...segments, s.id] : segments.filter((x) => x !== s.id))} /> {s.label}
          </label>
        ))}
        <span className="text-gray-500">{segments.length ? "" : "(all customers)"} {audience != null && `· ${audience} can get it`}</span>
      </div>
      {needsOwner && <p className="text-amber-700">This is above the owner&apos;s limits, so it will go to the owner&apos;s WhatsApp for approval first.</p>}
      {result && <p className={result.ok ? "text-gray-700" : "text-red-600"}>{result.text}</p>}
      <button disabled={busy} className="rounded-full bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? "Saving…" : needsOwner ? "Send for approval" : "Save offer"}
      </button>
    </form>
  );
}
