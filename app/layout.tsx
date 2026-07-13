import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Apple SF Pro — Text for UI/body, Display for large headings & figures.
const sfText = localFont({
  variable: "--font-sf-text",
  display: "swap",
  src: [
    { path: "./fonts/SFProText-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SFProText-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SFProText-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SFProText-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const sfDisplay = localFont({
  variable: "--font-sf-display",
  display: "swap",
  src: [
    { path: "./fonts/SFProDisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SFProDisplay-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/SFProDisplay-Bold.woff2", weight: "700", style: "normal" },
  ],
});

// A monospace, kept only for literal codes (GL / cost-center) and key hints.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "FlowCo · Approvals Triage",
  description: "AI-assisted expense approvals triage — Netchex take-home prototype",
};

const noFlashTheme = `(function(){try{var t=localStorage.getItem('flowco-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sfText.variable} ${sfDisplay.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
