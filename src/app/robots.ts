import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/ruta", "/mi-cuenta", "/sesion", "/login", "/api", "/vincular"],
    },
    sitemap: "https://semancontrol.pages.dev/sitemap.xml",
  };
}
