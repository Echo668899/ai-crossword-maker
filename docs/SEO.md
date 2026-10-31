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
- FAQPage JSON-LD when FAQ visible (home, AI, teachers, each example)
- ItemList on `/examples/`; BreadcrumbList on example detail
- No AggregateRating fiction
- `/app/`, `/admin/`, `/login/`, `/p/*` noindex; excluded from sitemap filter
- Real 404; sitemap via `@astrojs/sitemap`
- No Chinese routes
- Sample vs Human-reviewed labeling; no false “fact verified” claims

## 90-day

- **A:** P0 shells + maker demo + FAQ + sitemap (done)
- **B:** examples≥25 + print/FAQ/related links polish (in progress); ESL depth still light
- **C:** GSC-driven long-tail; 1–2 how-tos; honest comparison pages
