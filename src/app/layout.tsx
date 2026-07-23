import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Lumina",
    template: "%s · Lumina",
  },
  description:
    "Everything a local business needs to get customers and never miss one — content, front desk, and analytics in one AI-run dashboard.",
  manifest: "/manifest.webmanifest",
  // TODO(icons): raster PNG icons — ffmpeg on this machine has no SVG decoder
  // (no librsvg), so app/maskable icons are SVG-only for now. iOS's "Add to
  // Home Screen" and some Android launchers prefer/require PNG; swap in real
  // 192/512 PNGs (e.g. via sharp or resvg) before relying on installability
  // there. Desktop Chrome/Edge PWA install works fine with SVG today.
  icons: {
    icon: [{ url: "/icons/icon-512.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-512.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  // Light-first (owner direction): browser chrome matches the paper surface.
  themeColor: "#faf5ea",
};

// Flash-of-wrong-theme prevention. This is a plain string rendered by a
// SERVER component straight into the SSR HTML's <head> — it is never part of
// the client React tree, so it can't trip React 19's "script tag while
// rendering React component" warning (that warning only fires for <script>
// elements a *client* component renders). Mirrors src/components/theme-
// provider.tsx's resolution logic: read localStorage 'theme', resolve
// 'system' via matchMedia, default to 'dark', apply before first paint.
const THEME_INIT_SCRIPT = `(function(){try{var k="theme";var s=localStorage.getItem(k);var t=(s==="light"||s==="dark"||s==="system")?s:"light";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;if(r==="dark"){d.classList.add("dark")}else{d.classList.remove("dark")}d.style.colorScheme=r}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
