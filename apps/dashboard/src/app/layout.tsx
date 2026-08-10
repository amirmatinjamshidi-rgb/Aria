import type { Metadata } from "next";
import { Fira_Code, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const display = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-loaded",
});

const body = Fira_Code({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

export const metadata: Metadata = {
  title: "Aria",
  description: "Talk with Aria — cybernetic presence UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
