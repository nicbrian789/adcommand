import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthHashHandler } from "@/components/auth/AuthHashHandler";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ADCOMMAND — Advertising Command Center",
  description: "Unified dashboard for managing ad networks, campaigns, and statistics.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
