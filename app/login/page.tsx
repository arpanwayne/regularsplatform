import Link from "next/link";
import { AuthForm } from "@/components/forms/auth-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-2xl font-semibold mb-6">Log in to Regulars</h1>
      <AuthForm mode="login" />
      <p className="mt-4 text-sm text-gray-500">
        No account?{" "}
        <Link href="/signup" className="text-brand-700 font-medium">
          Sign up
        </Link>
      </p>
    </main>
  );
}
