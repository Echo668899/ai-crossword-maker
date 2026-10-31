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
  },
});
