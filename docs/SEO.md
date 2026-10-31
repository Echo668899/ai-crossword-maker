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
| `/blog/` + how-to posts | crawlable guides ↔ examples mesh + maker / printable / word-list |
| `/crossword-maker-from-word-list/` | vocabulary list → grid (FAQ + how-to CTA) |
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
- Word-list landing FAQ + how-to `/blog/how-to-make-a-crossword-from-a-word-list/` bridges paste → print
- Honest `/vs/` hub + `/vs/crossword-labs/` + `/vs/my-crossword-maker/` + `/vs/eclipse-crossword/` + `/vs/discovery-education-puzzlemaker/` + `/vs/armored-penguin/` (facts only; no AggregateRating fiction)
- Science vocabulary how-to bridges AI/word-list → printable science examples
- Spelling-list how-to bridges word-list landing → language/spelling example seeds
- Math vocabulary how-to bridges AI/word-list → printable math example seeds
- Social studies vocabulary how-to bridges AI/word-list → printable civics/geography example seeds

## 90-day

- **A:** P0 shells + crawler demo + FAQ + sitemap (done)
- **B:** examples≥25 + print/FAQ/related links polish (done); ESL/CEFR depth + how-tos (done)
- **C:** first-pass high-traffic review + name-line presets (PR #9); second-pass examples + print how-to (PR #10); long-tail +5 + blog mesh (PR #11); word-list how-to + Words UX (PR #12); long-tail batch-2 + `/vs/crossword-labs/` (PR #13); long-tail batch-3 + `/vs/my-crossword-maker/` + science how-to (PR #14); long-tail batch-4 + `/vs/eclipse-crossword/` + spelling-list how-to (PR #15); long-tail batch-5 + `/vs/discovery-education-puzzlemaker/` + math vocabulary how-to (PR #16); long-tail batch-6 + `/vs/armored-penguin/` + social studies vocabulary how-to (this slice); GSC-driven long-tail + more `/vs/` next
