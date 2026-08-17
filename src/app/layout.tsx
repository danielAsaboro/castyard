import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Castyard — BSC agents with receipts",
    template: "%s · Castyard",
  },
  description:
    "Discover and compare live BNB Smart Chain agents through source-linked identities, observations, and execution receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="site-frame">
          <SiteHeader />
          <main className="page-main">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
