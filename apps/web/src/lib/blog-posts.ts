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
    exampleSlugs: ["solar-system", "world-capitals", "greek-mythology", "parts-of-speech"],
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
