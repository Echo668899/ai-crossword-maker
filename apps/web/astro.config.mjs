import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

const site = process.env.PUBLIC_SITE_URL || "https://aicrosswordmaker.com";

export default defineConfig({
  site,
  trailingSlash: "always",
  integrations: [react(), sitemap()],
  vite: {
    ssr: {
      noExternal: ["@acm/ui", "@acm/config", "@acm/contracts", "@acm/crossword-engine", "@acm/print-layout"],
    },
    server: {
      proxy: {
        // Same-origin /api during `astro dev` → local Worker
        "/api": {
          target: process.env.PUBLIC_API_PROXY_TARGET || "http://127.0.0.1:8787",
          changeOrigin: true,
        },
      },
    },
  },
});
