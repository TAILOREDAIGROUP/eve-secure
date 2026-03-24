import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "EVE Secure - AI-Driven Security Assessment",
  description:
    "Comprehensive security assessment and incident response platform powered by EVE AI",
  keywords: [
    "security",
    "assessment",
    "incident response",
    "compliance",
    "ai",
  ],
  authors: [
    {
      name: "EVE Secure",
      url: "https://eve-secure.com",
    },
  ],
  creator: "EVE Secure",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://eve-secure.com",
    siteName: "EVE Secure",
    title: "EVE Secure - AI-Driven Security Assessment",
    description:
      "Comprehensive security assessment and incident response platform",
    images: [
      {
        url: "https://eve-secure.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "EVE Secure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EVE Secure",
    description: "AI-Driven Security Assessment",
    images: ["https://eve-secure.com/twitter-image.png"],
    creator: "@evesecure",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta charSet="utf-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta
            name="apple-mobile-web-app-capable"
            content="yes"
          />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
        </head>
        <body>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            storageKey="eve-secure-theme"
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
