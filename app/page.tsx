import Link from "next/link";
import { PRICING_TIERS } from "@/lib/pricing";

export default function HomePage() {
  return (
    <main>
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <span className="text-sm font-medium text-brand-700 bg-brand-100 px-3 py-1 rounded-full mb-4">
          WhatsApp-native loyalty platform
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Regulars</h1>
        <p className="max-w-xl text-gray-600 mb-8">
          Salons, gyms, clinics aur retail businesses ke repeat customers ko zero-effort
          WhatsApp data capture, AI behavioral segmentation, aur Hinglish AI calling scripts
          ke through wapas engage karo — koi extra app, koi manual setup nahi.
        </p>
        <div className="flex gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-brand-600 px-5 py-2.5 text-white font-medium hover:bg-brand-700 transition"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-100 transition"
          >
            Log in
          </Link>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-2">
            <h2 className="text-2xl font-semibold">Pricing</h2>
            <p className="text-sm text-gray-500 mt-1">
              Draft pricing — pilot customers ke feedback ke baad finalize hoga.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3 mt-8">
            {PRICING_TIERS.map((tier, i) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 ${
                  i === 1 ? "border-brand-600 shadow-sm" : "border-gray-200"
                }`}
              >
                <h3 className="font-semibold text-lg">{tier.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-bold">₹{tier.priceInrPerMonth.toLocaleString("en-IN")}</span>
                  <span className="text-gray-500">/month</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">{tier.customerLimit}</p>
                <ul className="mt-4 space-y-2 text-sm text-gray-600">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-brand-600">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
