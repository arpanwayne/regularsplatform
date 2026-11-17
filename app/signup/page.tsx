import Link from "next/link";
import { BUNDLE_NAME } from "@/lib/brand";
import { AuthForm } from "@/components/forms/auth-form";
import { BundleSignupForm } from "@/components/forms/bundle-signup-form";
import { isBundlePlan } from "@/lib/hub/plans";
import { getCurrentUser } from "@/lib/session";

// /signup                        → plain Regulars signup (unchanged)
// /signup?plan=GROW&country=CA   → Bundle A: one account for every tool
export default async function SignupPage({ searchParams }: { searchParams: { plan?: string; country?: string } }) {
  const plan = searchParams.plan?.toUpperCase();
  if (isBundlePlan(plan)) {
    const signedIn = await getCurrentUser();
    return (
      <main className="flex min-h-screen flex-col items-center px-6 py-12">
        {signedIn && (
          <div role="alert" className="mb-6 w-full max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You&apos;re signed in as {signedIn.email}. Creating an account here signs you out of that one and into the new business.
          </div>
        )}
        <h1 className="mb-1 text-2xl font-semibold">Start with {BUNDLE_NAME}</h1>
        <p className="mb-8 text-sm text-gray-500">AI receptionist, customer follow-ups, CRM and Google profile — one login, one bill.</p>
        <BundleSignupForm initialPlan={plan} initialCountry={searchParams.country?.toUpperCase() === "IN" ? "IN" : "CA"} />
        <p className="mt-6 text-sm text-gray-500">
          Already have an account? <Link href="/login" className="font-medium text-brand-700">Log in</Link>
        </p>
      </main>
    );
  }
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
