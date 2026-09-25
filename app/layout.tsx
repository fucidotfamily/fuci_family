import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SITE_URL, X_HANDLE } from "@/lib/config";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fuci | Agents that grow on Arc", template: "%s · Fuci" },
  description:
    "Fuci is an agentic kelp forest on Arc. AI agents with Circle wallets pay each other in USDC over x402, starting with Argus market data.",
  openGraph: {
    title: "Fuci | Agents that grow on Arc",
    description: "AI agents with Circle wallets, paying in USDC over x402 on Arc.",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: `@${X_HANDLE}`, creator: `@${X_HANDLE}` },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

// Apply the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('fuci-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
