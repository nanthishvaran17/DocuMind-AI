import type { Metadata } from "next";

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://documind.ai";

export const SITE_URL = rawSiteUrl.replace(/\/+$/, "");
export const SITE_NAME = "DocuMind AI";
export const SITE_TAGLINE = "Privacy-First PDF, Auto Document Scanner & AI Workspace";
export const SITE_DEFAULT_DESCRIPTION =
  "Scan multi-page documents hands-free, compress PDFs to exact KB targets, resize exam photos, convert DOCX/XLSX/PPTX, and ask cited questions in English and Tamil.";

export const BUSINESS_INFO = {
  name: "DocuMind AI",
  legalName: "DocuMind AI Document Studio",
  url: SITE_URL,
  email: "support@documind.ai",
  telephone: "+91-44-4000-2410",
  priceRange: "Free - $$",
  address: {
    streetAddress: "Module 14, Tidel Park, Rajiv Gandhi Salai, Taramani",
    addressLocality: "Chennai",
    addressRegion: "Tamil Nadu",
    postalCode: "600113",
    addressCountry: "IN",
  },
  geo: {
    latitude: 12.9896,
    longitude: 80.2486,
  },
  openingHours: "Mo-Sa 09:00-19:00",
} as const;

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}

export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: PageMetaInput): Metadata {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return {
    title,
    description,
    alternates: {
      canonical: normalizedPath,
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: normalizedPath,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_IN",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — ${title}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: ["/twitter-image"],
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false,
            googleBot: { index: false, follow: false },
          },
        }
      : {}),
  };
}
