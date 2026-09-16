import Link from "next/link";
import { AuthForm } from "@/components/forms/auth-form";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Create your Regulars account</h1>
      <AuthForm mode="signup" />
      <p className="mt-4 text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-700 font-medium">
          Log in
        </Link>
      </p>
    </main>
  );
}
