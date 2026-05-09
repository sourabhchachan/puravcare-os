import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ToastProvider } from "@/components/ui/ToastProvider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "PuravCare OS",
  description: "Hospital Operating System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
