import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailPilot — Email Operations",
  description: "Connect mailboxes, schedule outreach, monitor health and control sending ramps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
