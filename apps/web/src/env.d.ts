/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_AI_DEMO_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
