import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🎰 Gambling Calculator",
  description: "21点 & 牛牛 Score Tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="antialiased min-h-screen bg-[#0a0a0f]">{children}</body>
    </html>
  );
}
