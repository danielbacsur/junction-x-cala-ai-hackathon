import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { CabalaDefs } from "@/components/cabala/cabala";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Bookrunner", template: "%s · Bookrunner" },
  description:
    "Cabala reads two to three connections out from your company or fund in Cala's graph and returns the meetings worth taking, each with the sourced trail behind it.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f6e8cd",
  colorScheme: "light",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <CabalaDefs />
      </body>
    </html>
  );
}
