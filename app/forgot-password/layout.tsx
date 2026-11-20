import { AuthBrand } from "@/components/auth-brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-gray-50">
      <AuthBrand />
      {children}
    </div>
  );
}
