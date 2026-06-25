import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JLG Lead Routing",
  description: "Justin Landis Group lead routing tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
