# Grid algorithm

Package: `@acm/crossword-engine`.

1. **normalize** — A–Z only; spaces/hyphens/apostrophes stripped with display preserved; non-ASCII requires confirmation (no silent transliteration); duplicates flagged.
2. **build** — Mulberry32 seed; longest-first heuristic; bounded backtracking with node budget; Auto tries allowed sizes; never silently drops words (unplaced IDs returned).
3. **number** — Shared start cells share numbers.
4. **validate** — Independent row/column scan for ghost segments, letter match, connectivity, coverage.
5. **serialize** — ASCII grid, SVG, JSON snapshot helpers.

Statuses: `solved | partial | budget_exhausted | invalid_input | constraint_conflict | system_error`.
