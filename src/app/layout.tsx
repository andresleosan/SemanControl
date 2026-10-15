import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import PwaRegistration from "@/components/pwa-registration";

const appFont = Manrope({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export const metadata: Metadata = {
  title: "SemanControl",
  description: "Tu recorrido, tus tarjetas y tus cuentas en un solo lugar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#155f4b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CO" className={appFont.variable}><body>{children}<PwaRegistration /></body></html>;
}
