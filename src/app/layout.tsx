import type { Metadata } from "next";
import { headers } from "next/headers";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveSiteOrigin } from "@/lib/site-url";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = resolveSiteOrigin(await headers());
  const title = "Castyard — BSC agents with receipts";
  const description = "Discover and compare live BNB Smart Chain agents through source-linked identities, observations, and execution receipts.";
  const image = `${origin}/og.png`;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s · Castyard" },
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1731, height: 909, alt: "An evidence ledger linked to three agent receipts" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

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
