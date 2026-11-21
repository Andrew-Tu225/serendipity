import { Suspense } from "react";
import { LoginPanel } from "@/components/auth/login-panel";

export default function LoginPage() {
  return (
    <div className="flex flex-1 bg-background text-foreground">
      <Suspense fallback={<p className="m-auto p-8">Loading…</p>}>
        <LoginPanel />
      </Suspense>
    </div>
  );
}
