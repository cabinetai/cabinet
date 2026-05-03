import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitializer } from "@/components/layout/theme-initializer";
import { OPTALE_PRODUCT } from "@/lib/optale/product";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-logo",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: OPTALE_PRODUCT.name,
  description: OPTALE_PRODUCT.description,
  icons: {
    icon: [
      {
        url: "/optale-favicon.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/optale-favicon.svg",
    apple: "/optale-favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeInitializer />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
