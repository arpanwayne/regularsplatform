"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TOOL_META, type Tool } from "@/lib/hub/plans";
import { periodDays, priceLine, suggestedPrice } from "@/lib/hub/catalog-rules";

export type CatalogProductRow = {
  id: string; key: string; name: string; description: string | null; url: string | null;
  connect: string; hubTool: string | null; priceInr: number | null; priceCad: number | null;
  builtIn: boolean; active: boolean; sortOrder: number; bundleCount: number;
};
export type CatalogBundleRow = {
  id: string; name: string; description: string | null; priceInr: number | null; priceCad: number | null;
  interval: string; growthManager: boolean; smsMonthlyLimit: number | null; active: boolean;
  productIds: string[]; clients: { id: string; name: string }[];
};
type BuiltInPlan = { id: string; name: string; tools: Tool[]; priceInr: number; priceCad: number };
type ClientRow = {
  id: string; name: string; country: string; email: string; bundleStatus: string;
  frontDeskPlan: string | null; customBundleId: string | null; paidUntil: string | null;
};

const CONNECT_LABEL: Record<string, { label: string; tone: string; help: string }> = {
  HUB: { label: "Hub", tone: "bg-brand-100 text-brand-800", help: "Regulars itself — in every bundle" },
  AUTO: { label: "Auto-connect", tone: "bg-green-100 text-green-800", help: "Account made automatically, one login" },
  MANUAL: { label: "Manual", tone: "bg-amber-100 text-amber-800", help: "Our team sets it up, client opens it by link" },
};

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Math.max(0, Math.round(Number(s)));
};
const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error;
    const text = typeof e === "string" ? e : [...Object.values(e?.fieldErrors ?? {}).flat(), ...(e?.formErrors ?? [])].join(" ") || "Couldn't save.";
    throw new Error(text);
  }
  return data;
}

export function CatalogManager({ products, bundles, builtInPlans, businesses }: {
  products: CatalogProductRow[]; bundles: CatalogBundleRow[]; builtInPlans: BuiltInPlan[]; businesses: ClientRow[];
}) {
  return (
    <div className="space-y-8">
      <ProductsSection products={products} />
      <BundlesSection products={products} bundles={bundles} builtInPlans={builtInPlans} />
      <AssignSection bundles={bundles} builtInPlans={builtInPlans} businesses={businesses} />
    </div>
  );
}

// ── 1. Software ───────────────────────────────────────────────────────────

function ProductsSection({ products }: { products: CatalogProductRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); router.refresh(); return true; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } finally { setBusy(false); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: String(f.get("name") ?? "").trim(), description: str(f.get("description")), url: str(f.get("url")), priceInr: num(f.get("priceInr")), priceCad: num(f.get("priceCad")) };
    const ok = await run(() => (id ? send(`/api/admin/catalog/products/${id}`, "PATCH", body) : send("/api/admin/catalog/products", "POST", body)));
    if (ok) { setAdding(false); setEditing(null); }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">1. Software</h2>
          <p className="text-xs text-gray-500">Everything we sell. New software starts as Manual; making it Auto-connect needs a one-time code change in that software.</p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">+ Add software</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {adding && <ProductForm onSubmit={(e) => submit(e)} onCancel={() => setAdding(false)} busy={busy} />}
      <div className="overflow-x-auto rounded-card border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-4 py-2 font-medium">Software</th><th className="px-4 py-2 font-medium">Connects</th><th className="px-4 py-2 font-medium">Price</th><th className="px-4 py-2 font-medium">Bundles</th><th className="px-4 py-2 font-medium"></th></tr>
          </thead>
          <tbody>
            {products.map((p) => editing === p.id ? (
              <tr key={p.id} className="border-t border-gray-100"><td colSpan={5} className="px-4 py-3"><ProductForm product={p} onSubmit={(e) => submit(e, p.id)} onCancel={() => setEditing(null)} busy={busy} /></td></tr>
            ) : (
              <tr key={p.id} className={`border-t border-gray-100 align-top ${p.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.name}{!p.active && <span className="ml-2 text-xs text-gray-500">(off)</span>}</p>
                  {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                  {p.url && <a href={p.url} target="_blank" rel="noopener" className="text-xs text-brand-700 underline">{p.url}</a>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONNECT_LABEL[p.connect]?.tone ?? ""}`} title={CONNECT_LABEL[p.connect]?.help}>{CONNECT_LABEL[p.connect]?.label ?? p.connect}</span>
                  {p.hubTool && p.hubTool in TOOL_META && <p className="mt-1 text-xs text-gray-500">{TOOL_META[p.hubTool as Tool].name}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{priceLine({ priceInr: p.priceInr, priceCad: p.priceCad })}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.bundleCount}</td>
                <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => setEditing(p.id)} className="text-xs text-brand-700 underline">Edit</button>
                  {p.connect !== "HUB" && (
                    <button disabled={busy} onClick={() => run(() => send(`/api/admin/catalog/products/${p.id}`, "PATCH", { active: !p.active }))} className="text-xs text-gray-600 underline">{p.active ? "Switch off" : "Switch on"}</button>
                  )}
                  {!p.builtIn && p.bundleCount === 0 && (
                    <button disabled={busy} onClick={() => confirm(`Delete "${p.name}" from the catalog?`) && run(() => send(`/api/admin/catalog/products/${p.id}`, "DELETE"))} className="text-xs text-red-600 underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductForm({ product, onSubmit, onCancel, busy }: { product?: CatalogProductRow; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void; busy: boolean }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-card border border-gray-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Name" name="name" defaultValue={product?.name} required placeholder="e.g. Order Desk" />
      <Field label="Link (where the client opens it)" name="url" defaultValue={product?.url ?? ""} placeholder="https://…" type="url" />
      <div className="sm:col-span-2"><Field label="What it does" name="description" defaultValue={product?.description ?? ""} placeholder="One line for the client's home page" /></div>
      <Field label="Price ₹ / month (optional)" name="priceInr" defaultValue={product?.priceInr ?? ""} type="number" />
      <Field label="Price C$ / month (optional)" name="priceCad" defaultValue={product?.priceCad ?? ""} type="number" />
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : product ? "Save" : "Add software"}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">Cancel</button>
      </div>
    </form>
  );
}

// ── 2. Bundles ────────────────────────────────────────────────────────────

function BundlesSection({ products, bundles, builtInPlans }: { products: CatalogProductRow[]; bundles: CatalogBundleRow[]; builtInPlans: BuiltInPlan[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  async function run(fn: () => Promise<{ clientsUpdated?: number } | unknown>) {
    setBusy(true); setError(null);
    try {
      const r = (await fn()) as { clientsUpdated?: number } | undefined;
      if (r && typeof r.clientsUpdated === "number" && r.clientsUpdated > 0) alert(`${r.clientsUpdated} client(s) on this bundle were updated.`);
      router.refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } finally { setBusy(false); }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">2. Bundles</h2>
          <p className="text-xs text-gray-500">Pick any software, set a price. Regulars is always included. Editing a bundle updates every client on it.</p>
        </div>
        {editing === null && <button onClick={() => setEditing("new")} className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">+ New bundle</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {editing === "new" && (
        <BundleForm products={products} busy={busy} onCancel={() => setEditing(null)}
          onSave={async (body) => { if (await run(() => send("/api/admin/catalog/bundles", "POST", body))) setEditing(null); }} />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bundles.map((b) => editing === b.id ? (
          <div key={b.id} className="md:col-span-2 lg:col-span-3">
            <BundleForm bundle={b} products={products} busy={busy} onCancel={() => setEditing(null)}
              onSave={async (body) => { if (await run(() => send(`/api/admin/catalog/bundles/${b.id}`, "PATCH", body))) setEditing(null); }} />
          </div>
        ) : (
          <article key={b.id} className={`flex flex-col gap-2 rounded-card border border-gray-200 bg-white p-4 ${b.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="font-medium">{b.name}</h3>{b.description && <p className="text-xs text-gray-500">{b.description}</p>}</div>
              {!b.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Off</span>}
            </div>
            <p className="text-sm font-medium">{priceLine(b)}</p>
            <ul className="flex flex-wrap gap-1">
              {b.productIds.map((id) => byId.get(id)).filter(Boolean).map((p) => (
                <li key={p!.id} className={`rounded-full px-2 py-0.5 text-xs ${CONNECT_LABEL[p!.connect]?.tone ?? "bg-gray-100"}`}>{p!.name}</li>
              ))}
              {b.growthManager && <li className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">Growth Manager</li>}
            </ul>
            <p className="text-xs text-gray-500">{b.clients.length ? `Clients: ${b.clients.map((c) => c.name).join(", ")}` : "No clients yet"}</p>
            <div className="mt-auto flex gap-3 pt-1">
              <button onClick={() => setEditing(b.id)} className="text-xs text-brand-700 underline">Edit</button>
              <button disabled={busy} onClick={() => run(() => send(`/api/admin/catalog/bundles/${b.id}`, "PATCH", { active: !b.active }))} className="text-xs text-gray-600 underline">{b.active ? "Switch off" : "Switch on"}</button>
              {b.clients.length === 0 && <button disabled={busy} onClick={() => confirm(`Delete bundle "${b.name}"?`) && run(() => send(`/api/admin/catalog/bundles/${b.id}`, "DELETE"))} className="text-xs text-red-600 underline">Delete</button>}
            </div>
          </article>
        ))}
        {builtInPlans.map((p) => (
          <article key={p.id} className="flex flex-col gap-2 rounded-card border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="font-medium">{p.name}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">Built-in plan</span></div>
            <p className="text-sm font-medium">{priceLine({ priceInr: p.priceInr, priceCad: p.priceCad })}</p>
            <ul className="flex flex-wrap gap-1">
              <li className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-900">Regulars</li>
              {p.tools.map((t) => <li key={t} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">{TOOL_META[t].name}</li>)}
            </ul>
            <p className="text-xs text-gray-500">Sold on the website with online payment. Not editable here.</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type BundleBody = {
  name: string; description: string | null; productIds: string[]; priceInr: number | null; priceCad: number | null;
  interval: string; growthManager: boolean; smsMonthlyLimit: number | null;
};

function BundleForm({ bundle, products, busy, onSave, onCancel }: {
  bundle?: CatalogBundleRow; products: CatalogProductRow[]; busy: boolean; onSave: (b: BundleBody) => void; onCancel: () => void;
}) {
  const hubIds = products.filter((p) => p.connect === "HUB").map((p) => p.id);
  const [picked, setPicked] = useState<Set<string>>(new Set([...(bundle?.productIds ?? []), ...hubIds]));
  const [priceInr, setPriceInr] = useState<string>(bundle?.priceInr?.toString() ?? "");
  const [priceCad, setPriceCad] = useState<string>(bundle?.priceCad?.toString() ?? "");
  const choosable = products.filter((p) => p.active || picked.has(p.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const suggestion = suggestedPrice(products.filter((p) => picked.has(p.id)));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSave({
      name: String(f.get("name") ?? "").trim(),
      description: str(f.get("description")),
      productIds: Array.from(picked),
      priceInr: priceInr.trim() === "" ? null : Math.round(Number(priceInr)),
      priceCad: priceCad.trim() === "" ? null : Math.round(Number(priceCad)),
      interval: String(f.get("interval") ?? "MONTHLY"),
      growthManager: f.get("growthManager") === "on",
      smsMonthlyLimit: num(f.get("smsMonthlyLimit")),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card border border-brand-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bundle name" name="name" defaultValue={bundle?.name} required placeholder="e.g. Manufacturer Pack" />
        <Field label="Short description (optional)" name="description" defaultValue={bundle?.description ?? ""} placeholder="Who it's for" />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Software in this bundle</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {choosable.map((p) => (
            <label key={p.id} className={`flex items-start gap-2 rounded-card border px-3 py-2 text-sm ${picked.has(p.id) ? "border-brand-400 bg-brand-50" : "border-gray-200"}`}>
              <input type="checkbox" checked={picked.has(p.id)} disabled={p.connect === "HUB"} onChange={() => toggle(p.id)} className="mt-0.5" />
              <span>
                <span className="font-medium">{p.name}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${CONNECT_LABEL[p.connect]?.tone ?? ""}`}>{CONNECT_LABEL[p.connect]?.label}</span>
                {p.description && <span className="block text-xs text-gray-500">{p.description}</span>}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">Price ₹</span>
          <input type="number" min={0} value={priceInr} onChange={(e) => setPriceInr(e.target.value)} className="w-full rounded-input border border-control px-3 py-2" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">Price C$</span>
          <input type="number" min={0} value={priceCad} onChange={(e) => setPriceCad(e.target.value)} className="w-full rounded-input border border-control px-3 py-2" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">Billed</span>
          <select name="interval" defaultValue={bundle?.interval ?? "MONTHLY"} className="w-full rounded-input border border-control px-3 py-2"><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label>
        <Field label="Included SMS / month (optional)" name="smsMonthlyLimit" defaultValue={bundle?.smsMonthlyLimit ?? ""} type="number" />
      </div>
      {(suggestion.priceInr != null || suggestion.priceCad != null) && (
        <p className="text-xs text-gray-500">
          Software prices add up to {priceLine(suggestion)}.{" "}
          <button type="button" className="text-brand-700 underline" onClick={() => { setPriceInr(suggestion.priceInr?.toString() ?? ""); setPriceCad(suggestion.priceCad?.toString() ?? ""); }}>Use this</button>
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="growthManager" defaultChecked={bundle?.growthManager ?? false} />
        Include the Growth Manager (morning plan, win-backs, missed-call text-back)
      </label>
      <div className="flex gap-2">
        <button disabled={busy || picked.size === 0} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : bundle ? "Save bundle" : "Create bundle"}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">Cancel</button>
      </div>
    </form>
  );
}

// ── 3. Give a bundle to a client ─────────────────────────────────────────

function AssignSection({ bundles, builtInPlans, businesses }: { bundles: CatalogBundleRow[]; builtInPlans: BuiltInPlan[]; businesses: ClientRow[] }) {
  const router = useRouter();
  const active = bundles.filter((b) => b.active);
  const [clientId, setClientId] = useState(businesses[0]?.id ?? "");
  const [choice, setChoice] = useState(active[0] ? `custom:${active[0].id}` : builtInPlans[0] ? `plan:${builtInPlans[0].id}` : "");
  const chosenBundle = choice.startsWith("custom:") ? bundles.find((b) => b.id === choice.slice(7)) : null;
  const [days, setDays] = useState<number>(chosenBundle ? periodDays(chosenBundle.interval) : 30);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const client = businesses.find((b) => b.id === clientId);
  const currency = client?.country === "IN" ? "₹" : "C$";

  function pick(v: string) {
    setChoice(v);
    const b = v.startsWith("custom:") ? bundles.find((x) => x.id === v.slice(7)) : null;
    setDays(b ? periodDays(b.interval) : 30);
  }

  async function activate() {
    if (!clientId || !choice) return;
    setBusy(true); setMsg(null);
    const base = { days, ...(Number(amount) > 0 ? { amount: Number(amount) } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    const body = choice.startsWith("custom:") ? { action: "activate-custom", bundleId: choice.slice(7), ...base } : { action: "activate", plan: choice.slice(5), ...base };
    try {
      const d = await send(`/api/admin/businesses/${clientId}/bundle`, "POST", body);
      const tools = (d.tools ?? []) as { tool: string; ok: boolean; error?: string; skipped?: string }[];
      setMsg({ ok: true, text: `Active until ${new Date(d.paidUntil).toLocaleDateString("en-IN")}. ${tools.length ? tools.map((t) => `${TOOL_META[t.tool as Tool]?.name ?? t.tool}: ${t.ok ? "set up" : t.skipped ?? t.error}`).join(" · ") : "No connected tools to set up."}` });
      setAmount(""); setNote("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  const current = (b: ClientRow) => {
    if (b.customBundleId) return bundles.find((x) => x.id === b.customBundleId)?.name ?? "Custom bundle";
    if (b.frontDeskPlan) return builtInPlans.find((p) => p.id === b.frontDeskPlan)?.name ?? b.frontDeskPlan;
    return "No bundle";
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">3. Give a bundle to a client</h2>
        <p className="text-xs text-gray-500">For a payment taken offline (bank, UPI, e-Transfer) or a free pilot. Connected software is set up straight away; follow manual set-ups in Admin → Bundles.</p>
      </div>
      <div className="grid gap-3 rounded-card border border-gray-200 bg-white p-4 md:grid-cols-6">
        <label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium text-gray-700">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-input border border-control px-3 py-2">
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.country} · now: {current(b)}</option>)}
          </select></label>
        <label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium text-gray-700">Bundle</span>
          <select value={choice} onChange={(e) => pick(e.target.value)} className="w-full rounded-input border border-control px-3 py-2">
            {active.length > 0 && <optgroup label="Our bundles">{active.map((b) => <option key={b.id} value={`custom:${b.id}`}>{b.name}</option>)}</optgroup>}
            <optgroup label="Built-in plans">{builtInPlans.map((p) => <option key={p.id} value={`plan:${p.id}`}>{p.name}</option>)}</optgroup>
          </select></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">Days</span>
          <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-input border border-control px-3 py-2" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">Paid {currency}</span>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="blank = pilot" className="w-full rounded-input border border-control px-3 py-2" /></label>
        <label className="block text-sm md:col-span-4"><span className="mb-1 block font-medium text-gray-700">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. UPI ref 4821, 3-month deal" className="w-full rounded-input border border-control px-3 py-2" /></label>
        <div className="flex items-end md:col-span-2">
          <button disabled={busy || !clientId || !choice} onClick={activate} className="w-full rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Activating…" : "Activate"}</button>
        </div>
        {chosenBundle && <p className="text-xs text-gray-500 md:col-span-6">{chosenBundle.name}: {priceLine(chosenBundle)}{client?.customBundleId && client.customBundleId !== chosenBundle.id ? " · replaces the client's current bundle" : ""}</p>}
        {msg && <p className={`text-sm md:col-span-6 ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}

function Field({ label, name, defaultValue, placeholder, type = "text", required }: { label: string; name: string; defaultValue?: string | number | null; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} min={type === "number" ? 0 : undefined}
        className="w-full rounded-input border border-control px-3 py-2" />
    </label>
  );
}
