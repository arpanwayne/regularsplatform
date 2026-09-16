import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
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
    </main>
  );
}
