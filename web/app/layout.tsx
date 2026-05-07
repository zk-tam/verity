import type { Metadata } from "next";
import { Suspense } from "react";
import { Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { UILayout } from "./ui-layout";
import { Analytics } from "@vercel/analytics/next";
import { assetUrl } from "@/lib/assets";
import { ApplyPendingReferral } from "@/components/apply-pending-referral";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});
const loosExtendedBold = localFont({
  src: "./fonts/Loos_Extended_Bold.otf",
  display: "swap",
  variable: "--font-loos-extended-bold",
});

const loosExtraWideMedium = localFont({
  src: "./fonts/Loos_ExtraWide_Medium.otf",
  display: "swap",
  variable: "--font-loos-extra-wide-medium",
})

const websiteDescription = "Play the present, Trade the future. The On-Chain TCG Hub.";

export const metadata: Metadata = {
  title: "Verity",
  description: websiteDescription,
  icons: {
    icon: [
      { url: assetUrl("gradient-logomark.svg"), sizes: "32x32", type: "image/png" },
      { url: assetUrl("gradient-logomark.svg"), sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: assetUrl("gradient-logomark.svg"), sizes: "180x180", type: "image/png" },
    ],
    shortcut: assetUrl("gradient-logomark.svg"),
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Verity",
  },
  openGraph: {
    title: "Verity",
    description: websiteDescription,
    type: "website",
    url: "https://theverity.xyz",
    siteName: "theverity.xyz",
    images: [
      { url: assetUrl("preview_image.png"), width: 1200, height: 630, alt: "Verity Preview Image" },
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Verity",
    description: websiteDescription,
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sora.className} ${sora.variable} ${loosExtendedBold.variable} ${loosExtraWideMedium.variable}`}
      >
        <Providers>
          <Suspense fallback={null}>
            <ApplyPendingReferral />
          </Suspense>
          <UILayout>{children}</UILayout>
        </Providers>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
