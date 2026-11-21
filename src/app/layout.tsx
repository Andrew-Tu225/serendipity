import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serendipity",
  description: "Discover and share experiences with friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="serendipity">{children}</body>
    </html>
  );
}
