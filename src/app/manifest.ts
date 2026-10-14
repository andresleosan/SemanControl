import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "SemanControl", short_name: "SemanControl", description: "Tu ruta, abonos y tarjetas cada viernes.", start_url: "/ruta", scope: "/", display: "standalone", orientation: "portrait-primary", lang: "es-CO", background_color: "#f3f6f8", theme_color: "#155f4b", icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
