import type { AuthSession } from "@/types/auth";
import { apiRequest } from "./client";

export const authClient = {
  startLogin(): void {
    // The OIDC redirect requires browser navigation rather than a fetch request.
    window.location.assign(new URL("/api/auth/login", window.location.origin).href);
  },

  getSession(signal?: AbortSignal): Promise<AuthSession> {
    return apiRequest<AuthSession>("/auth/me", { signal });
  },

  async signOut(csrfToken: string): Promise<void> {
    const { logout_url } = await apiRequest<{ logout_url: string }>("/auth/logout", {
      method: "POST",
      csrfToken,
    });
    window.location.replace(logout_url);
  },
};
