import type { Metadata } from "next";
import { League_Spartan } from "next/font/google";
import "./globals.css";

const spartan = League_Spartan({ subsets: ["latin"], weight: ["400", "600", "900"], display: "swap" });

export const metadata: Metadata = {
  title: "BLEUSKM Studio OS",
  description: "Internal production hub for BLEUSKM Studios.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spartan.className}>
      <body>{children}</body>
    </html>
  );
}
