import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/session-provider";

export const metadata: Metadata = {
  title: "serendipity",
  description: "Discover the world through the experiences of people you trust.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="serendipity flex min-h-full flex-col"><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
