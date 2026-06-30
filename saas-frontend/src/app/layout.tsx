import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import SentryInit from "@/components/SentryInit";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VoiceFlow AI — Voice Agent Platform",
  description: "Premium AI voice agent platform for customer service automation",
  manifest: "/manifest.webmanifest",
  themeColor: "#F22F46",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VoiceFlow",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#F22F46" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Service workers are registered exclusively by registerServiceWorker()
            in providers.tsx — registering firebase-messaging-sw.js at root scope
            here clobbered sw.js and caused the perpetual "new version available"
            banner, so the inline registration was removed. */}
      </head>
      <body className="font-sans antialiased bg-neutral-50 text-neutral-900">
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
