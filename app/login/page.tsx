import Link from "next/link";
import { AuthForm } from "@/components/forms/auth-form";
import { PORTAL_NAME, currentPortal } from "@/lib/portal";

export default function LoginPage({ searchParams }: { searchParams: { moved?: string } }) {
  const name = PORTAL_NAME[currentPortal()];
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      {searchParams.moved && (
        <div role="status" className="mb-6 w-full max-w-sm rounded-card border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Your account lives on {name}. Please log in here.
        </div>
      )}
      <h1 className="text-2xl font-semibold mb-6">Log in to {name}</h1>
      <AuthForm mode="login" />
      <p className="mt-3 text-sm">
        <Link href="/forgot-password" className="text-brand-700 font-medium">
          Forgot password?
        </Link>
      </p>
      <p className="mt-4 text-sm text-gray-500">
        No account?{" "}
        <Link href="/signup" className="text-brand-700 font-medium">
          Sign up
        </Link>
      </p>
    </main>
  );
}
