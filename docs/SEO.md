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
| `/examples/` + `/examples/[slug]/` | topic long-tail (≥30 seeds; ESL + new classroom long-tail) |
| `/esl-crossword-generator/` | ESL vocabulary + CEFR presets |
| `/cefr-crossword/` | A1–C1 level picker (independent page) |
| `/blog/` + how-to posts | crawlable guides ↔ examples mesh + maker / printable |
| `/pricing/`, `/how-it-works/` | conversion / trust |

## Technical baseline

- SSG HTML with unique title/description/canonical
- FAQPage JSON-LD when FAQ visible (home, AI, teachers, each example)
- ItemList on `/examples/`; BreadcrumbList on example detail
- No AggregateRating fiction
- `/app/`, `/admin/`, `/login/`, `/p/*` noindex; sitemap filter excludes those + `/404`
- Real 404; sitemap via `@astrojs/sitemap`
- No Chinese routes
- Sample vs Human-reviewed labeling; no false “fact verified” claims
- Teacher/printable pages + examples cross-link blog/ESL/CEFR; home features high-traffic examples
- Teachers ↔ printable dedicated CTAs; print how-to post bridges both landings
- Shared `blog-posts` catalog drives related guides; example pages link “Related how-tos”

## 90-day

- **A:** P0 shells + maker demo + FAQ + sitemap (done)
- **B:** examples≥25 + print/FAQ/related links polish (done); ESL/CEFR depth + how-tos (done)
- **C:** first-pass high-traffic review + name-line presets (done via PR #9); second-pass examples + print how-to + teachers↔printable CTAs (PR #10); long-tail +5 + blog mesh + maker UX (this slice); GSC-driven long-tail next; honest `/vs/` comparison pages still open
