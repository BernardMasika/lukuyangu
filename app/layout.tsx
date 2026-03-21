import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Luku Yangu",
  description: "Personal LUKU prepaid electricity tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Luku Yangu",
  },
};

export const viewport: Viewport = {
  themeColor: "#003399",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sw"
      className={`${geistSans.variable} ${geistMono.variable} dark`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen bg-gray-50 text-zinc-900 antialiased dark:bg-black dark:text-white">
        <Providers>
          <main className="mx-auto max-w-lg pb-20 px-4 pt-6">{children}</main>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}
