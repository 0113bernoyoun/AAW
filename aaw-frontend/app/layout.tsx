import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AAW - AI Auto Worker",
  description: "AI CLI Task Orchestration Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">{children}</body>
    </html>
  );
}
