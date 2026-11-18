import type { Metadata } from "next";
import localFont from "next/font/local";

// CRM-only typography. These fonts are loaded and applied inside /crm/* only,
// so the public website keeps its own font.
// Headings: Fraunces (soft serif). Text: Space Grotesk (clean grotesque).
//
// Self-hosted from ./fonts (Fontsource builds, SIL Open Font License) so dev
// and builds never depend on downloading from Google Fonts.
const crmDisplay = localFont({
  src: "./fonts/Fraunces-Variable.woff2", // variable: wght 100–900, opsz, SOFT, WONK
  variable: "--font-crm-fraunces",
  weight: "100 900",
  display: "swap",
});

const crmBody = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2", // variable: wght 300–700
  variable: "--font-crm-grotesk",
  weight: "300 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BHOOKR CRM",
  // Hide all /crm/* routes from search engines.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${crmDisplay.variable} ${crmBody.variable} crm-root min-h-screen antialiased`}
    >
      {children}
    </div>
  );
}
