/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — modified 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Mono, Permanent_Marker, Roboto_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
// Fonts that mirror what Rust ships for CUI text.
const robotoCondensed = Roboto_Condensed({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-roboto-condensed",
});
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker" });
const droidMono = Noto_Sans_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-droid-mono" });

export const metadata: Metadata = {
  title: "RustCuiTool",
  description:
    "Визуальный редактор Rust CUI: перетаскивайте, настраивайте якоря и стили, экспортируйте готовый JSON или C# для Oxide / Carbon.",
};

export const viewport: Viewport = { themeColor: "#0b0c0e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${mono.variable} ${robotoCondensed.variable} ${marker.variable} ${droidMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
