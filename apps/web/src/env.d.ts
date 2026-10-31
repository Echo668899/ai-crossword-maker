/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_AI_DEMO_ENABLED: string;
  /** Optional absolute API origin for preview (e.g. http://127.0.0.1:8787). Dev uses Vite proxy. */
  readonly PUBLIC_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
