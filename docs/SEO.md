# SEO plan

**Goal:** English organic traffic without ads. Tool pages + example long-tail.

## P0 URL map

| URL | Intent |
| --- | --- |
| `/` | crossword maker / free / generator |
| `/ai-crossword-maker/` | AI crossword maker/generator |
| `/crossword-maker-for-teachers/` | teachers |
| `/printable-crossword-maker/` | printable / answer key |
| `/crossword-maker-from-word-list/` | vocabulary list |
| `/examples/` + `/examples/[slug]/` | topic long-tail (≥20 seeds) |
| `/pricing/`, `/how-it-works/` | conversion / trust |

`/cefr-crossword/` → 301 to `/esl-crossword-generator/` until independent depth exists.

## Technical baseline

- SSG HTML with unique title/description/canonical
- FAQPage JSON-LD only when FAQ visible
- No AggregateRating fiction
- `/app/`, `/admin/` noindex; `/p/*` noindex (when added)
- Real 404; sitemap via `@astrojs/sitemap`
- No Chinese routes

## 90-day

- **A:** P0 shells + maker demo + FAQ + sitemap (this build)
- **B:** polish examples/internal links; ESL depth
- **C:** GSC-driven long-tail; 1–2 how-tos; honest comparison pages
