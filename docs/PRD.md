# PRD — AI Crossword Maker

## Positioning

English AI crossword maker for teachers and learners: topic or word list → editable clues → interlocking grid → printable PDF + answer key. Not a daily play portal; not a Chinese/idiom product; not a professional NYT constructor.

## Hard constraints

- English only
- AI Topic is the primary narrative; manual mode must work without GPT
- Hybrid monetization (Free quota + Pro + Credit Pack; Activity Pack retained)
- Anonymous AI demo when configured (Turnstile/budget later)
- GPT never owns grid/numbering/validation/billing
- Domain default: `https://crosswordmaker.app`

## MVP acceptance (engineering)

1. Manual words+clues → build → validate → student PDF + answer PDF without login
2. P0 SEO pages emit real HTML (title, FAQ, maker shell)
3. ≥20 `/examples/[slug]/` SSG pages with grid + clues HTML
4. Engine unit + property tests green
5. API health + pricing config; AI endpoint honest about missing keys

## Non-goals (MVP)

Chinese locales, daily crossword plaza, wedding template push, cryptic, symmetry autofill, mobile apps, paid ads.
