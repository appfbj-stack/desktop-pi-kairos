import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kairós — Assistente Pessoal",
  description: "Converse com a IA do Kairós direto do navegador. PWA instalável.",
  manifest: "/manifest.webmanifest",
  applicationName: "Kairós",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kairós",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a1d3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}
