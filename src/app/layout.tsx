import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif, Cardo } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitializer } from "@/components/layout/theme-initializer";
import { LocaleInitializer } from "@/components/layout/locale-initializer";
import "./globals.css";

// Runs before hydration so RTL/LTR + lang are applied to <html> on first paint.
// Mirrors next-themes' inline-script pattern. Keep this minified-ish; it ships
// inline in every page load.
const localeBootstrap = `(function(){try{var l=localStorage.getItem('cabinet-locale');if(l!=='en'&&l!=='he')l='en';var d=l==='he'?'rtl':'ltr';document.documentElement.lang=l;document.documentElement.dir=d;}catch(e){}})();`;

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

// Hebrew-capable serif used for the `cabinet` logo (and any .font-logo
// surface) when the UI is in RTL. Cardo ships italic glyphs for Hebrew so
// the brand mark keeps its handwritten cursive feel.
const cardo = Cardo({
  variable: "--font-logo-rtl",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cabinet",
  description: "AI-first knowledge base and startup OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${cardo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleInitializer />
          <ThemeInitializer />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
