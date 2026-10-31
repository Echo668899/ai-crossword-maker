/** Shared blog catalog for index + cross-links (English how-tos only). */

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  /** Landing / tool pages this guide should always link. */
  toolPaths: string[];
  /** Example slugs featured inside the guide body or related strip. */
  exampleSlugs: string[];
}

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "how-to-make-a-crossword-puzzle",
    title: "How to Make a Crossword Puzzle",
    description:
      "Step-by-step: pick a topic or word list, edit clues, build a grid, and print with an answer key.",
    toolPaths: [
      "/ai-crossword-maker/",
      "/crossword-maker-from-word-list/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "solar-system",
      "world-capitals",
      "greek-mythology",
      "parts-of-speech",
      "states-of-matter",
      "synonyms",
    ],
  },
  {
    slug: "how-to-make-esl-vocabulary-crosswords",
    title: "How to Make ESL Vocabulary Crosswords",
    description:
      "Use CEFR levels and classroom themes to build printable ESL crosswords with editable clues.",
    toolPaths: ["/esl-crossword-generator/", "/cefr-crossword/", "/ai-crossword-maker/"],
    exampleSlugs: [
      "esl-food-vocabulary",
      "esl-daily-routines",
      "esl-jobs-and-work",
      "irregular-verbs",
      "esl-travel-phrases",
      "synonyms",
      "telling-time",
    ],
  },
  {
    slug: "how-to-print-crossword-worksheets",
    title: "How to Print Crossword Worksheets with Answer Keys",
    description:
      "Choose Letter/A4, add name/class/date lines, and export student PDFs with a matching answer key.",
    toolPaths: ["/printable-crossword-maker/", "/crossword-maker-for-teachers/"],
    exampleSlugs: [
      "classroom-objects",
      "parts-of-speech",
      "animal-habitats",
      "renewable-energy",
      "food-chains",
      "continents-and-oceans",
    ],
  },
  {
    slug: "how-to-make-a-crossword-from-a-word-list",
    title: "How to Make a Crossword from a Word List",
    description:
      "Paste a spelling or vocabulary list, add or fill clues, build an interlocking grid, and print with an answer key.",
    toolPaths: [
      "/crossword-maker-from-word-list/",
      "/crossword-maker-for-teachers/",
      "/printable-crossword-maker/",
    ],
    exampleSlugs: [
      "classroom-objects",
      "parts-of-speech",
      "irregular-verbs",
      "esl-food-vocabulary",
      "fractions",
      "telling-time",
      "synonyms",
    ],
  },
  {
    slug: "how-to-make-a-science-vocabulary-crossword",
    title: "How to Make a Science Vocabulary Crossword",
    description:
      "Turn a science unit word bank into a printable crossword with definition clues, interlocking grid, and answer key.",
    toolPaths: [
      "/ai-crossword-maker/",
      "/crossword-maker-from-word-list/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "rock-cycle",
      "types-of-clouds",
      "states-of-matter",
      "food-chains",
      "photosynthesis",
      "water-cycle",
      "simple-machines",
      "phases-of-the-moon",
      "force-and-motion",
      "life-cycles",
      "ecosystems",
      "magnets",
      "volcanoes",
      "biomes",
    ],
  },
  {
    slug: "how-to-make-a-crossword-from-a-spelling-list",
    title: "How to Make a Crossword from a Spelling List",
    description:
      "Turn a weekly spelling or vocabulary list into a printable crossword with definition clues, interlocking grid, and answer key.",
    toolPaths: [
      "/crossword-maker-from-word-list/",
      "/ai-crossword-maker/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "homophones",
      "antonyms",
      "synonyms",
      "irregular-verbs",
      "parts-of-speech",
      "place-value",
      "prefixes-and-suffixes",
      "figurative-language",
      "compound-words",
    ],
  },
  {
    slug: "how-to-make-a-math-vocabulary-crossword",
    title: "How to Make a Math Vocabulary Crossword",
    description:
      "Turn a math unit word bank into a printable crossword with definition clues, interlocking grid, and answer key.",
    toolPaths: [
      "/ai-crossword-maker/",
      "/crossword-maker-from-word-list/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "measurement",
      "place-value",
      "geometry-shapes",
      "fractions",
      "money-math",
      "telling-time",
      "decimals",
      "area-and-perimeter",
    ],
  },
  {
    slug: "how-to-make-a-social-studies-vocabulary-crossword",
    title: "How to Make a Social Studies Vocabulary Crossword",
    description:
      "Turn a civics, geography, or history word bank into a printable crossword with definition clues, interlocking grid, and answer key.",
    toolPaths: [
      "/ai-crossword-maker/",
      "/crossword-maker-from-word-list/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "branches-of-government",
      "natural-resources",
      "map-skills",
      "landforms",
      "continents-and-oceans",
      "world-capitals",
      "thirteen-colonies",
    ],
  },
  {
    slug: "how-to-make-a-history-vocabulary-crossword",
    title: "How to Make a History Vocabulary Crossword",
    description:
      "Turn a history unit word bank into a printable crossword with definition clues, interlocking grid, and answer key.",
    toolPaths: [
      "/ai-crossword-maker/",
      "/crossword-maker-from-word-list/",
      "/printable-crossword-maker/",
      "/crossword-maker-for-teachers/",
    ],
    exampleSlugs: [
      "thirteen-colonies",
      "american-revolution",
      "ancient-egypt",
      "civil-rights-leaders",
      "greek-mythology",
      "branches-of-government",
    ],
  },
];

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Other guides for a related strip (excludes current slug). */
export function relatedBlogPosts(slug: string, limit = 3): BlogPostMeta[] {
  return BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, limit);
}

/**
 * Pick how-tos that feature this example (or fall back to general make + print guides).
 * Used on example detail pages for a crawlable blog ↔ examples mesh.
 */
export function blogPostsForExample(exampleSlug: string, limit = 2): BlogPostMeta[] {
  const featured = BLOG_POSTS.filter((p) => p.exampleSlugs.includes(exampleSlug));
  if (featured.length >= limit) return featured.slice(0, limit);
  const fallback = BLOG_POSTS.filter((p) => !featured.includes(p));
  return [...featured, ...fallback].slice(0, limit);
}
