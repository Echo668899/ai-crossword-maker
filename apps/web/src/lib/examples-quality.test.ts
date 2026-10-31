import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXAMPLES,
  HIGH_TRAFFIC_EXAMPLE_SLUGS,
  LONG_TAIL_EXPANSION_SLUGS,
  SECOND_PASS_REVIEWED_SLUGS,
  getExample,
  relatedExamples,
} from "./examples";
import { BLOG_POSTS, blogPostsForExample, relatedBlogPosts } from "./blog-posts";
import { buildExamplePuzzle } from "./build-example";

describe("examples quality", () => {
  it("ships at least 20 unique topic examples", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(20);
    const slugs = new Set(EXAMPLES.map((e) => e.slug));
    expect(slugs.size).toBe(EXAMPLES.length);
  });

  it("marks high-traffic classroom seeds as human-reviewed with stronger blurbs", () => {
    for (const slug of HIGH_TRAFFIC_EXAMPLE_SLUGS) {
      const ex = getExample(slug);
      expect(ex, slug).toBeTruthy();
      expect(ex!.reviewState).toBe("human_reviewed");
      expect(ex!.blurb.toLowerCase()).toMatch(/print|crossword|vocabulary|answer/);
      expect(ex!.entries.every((e) => e.clue.trim().length >= 12)).toBe(true);
    }
  });

  it("marks second-pass classroom/ESL seeds as human-reviewed", () => {
    for (const slug of SECOND_PASS_REVIEWED_SLUGS) {
      const ex = getExample(slug);
      expect(ex, slug).toBeTruthy();
      expect(ex!.reviewState).toBe("human_reviewed");
      expect(ex!.blurb.toLowerCase()).toMatch(/print|crossword|vocabulary|answer/);
      expect(ex!.entries.every((e) => e.clue.trim().length >= 12)).toBe(true);
    }
  });

  it("marks long-tail expansion seeds as human-reviewed with printable blurbs", () => {
    expect(LONG_TAIL_EXPANSION_SLUGS.length).toBeGreaterThanOrEqual(3);
    for (const slug of LONG_TAIL_EXPANSION_SLUGS) {
      const ex = getExample(slug);
      expect(ex, slug).toBeTruthy();
      expect(ex!.reviewState).toBe("human_reviewed");
      expect(ex!.blurb.toLowerCase()).toMatch(/print|crossword|vocabulary|answer/);
      expect(ex!.entries.every((e) => e.clue.trim().length >= 12)).toBe(true);
    }
  });

  it("keeps a blog ↔ examples internal link mesh", () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(3);
    for (const post of BLOG_POSTS) {
      expect(post.toolPaths.length).toBeGreaterThanOrEqual(2);
      expect(post.exampleSlugs.length).toBeGreaterThanOrEqual(2);
      for (const slug of post.exampleSlugs) {
        expect(getExample(slug), `${post.slug} → ${slug}`).toBeTruthy();
      }
      const related = relatedBlogPosts(post.slug);
      expect(related.every((p) => p.slug !== post.slug)).toBe(true);
    }
    for (const slug of LONG_TAIL_EXPANSION_SLUGS) {
      const posts = blogPostsForExample(slug, 2);
      expect(posts.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses English A–Z answers and non-empty blurbs/clues", () => {
    for (const ex of EXAMPLES) {
      expect(ex.title.trim().length).toBeGreaterThan(2);
      expect(ex.topic.trim().length).toBeGreaterThan(2);
      expect(ex.gradeBand.trim().length).toBeGreaterThan(3);
      expect(ex.blurb.trim().length).toBeGreaterThan(20);
      expect(ex.entries.length).toBeGreaterThanOrEqual(6);
      for (const entry of ex.entries) {
        expect(entry.answer).toMatch(/^[A-Z]{3,24}$/);
        expect(entry.clue.trim().length).toBeGreaterThan(3);
        expect(entry.clue.toUpperCase()).not.toContain(entry.answer);
      }
    }
  });

  it(
    "places a majority of entries for each example seed search",
    () => {
      for (const ex of EXAMPLES) {
        const built = buildExamplePuzzle(ex);
        const ratio = built.result.placedEntryIds.length / ex.entries.length;
        expect(ratio).toBeGreaterThanOrEqual(0.5);
        expect(built.across.length + built.down.length).toBe(built.result.placements.length);
        expect(built.svgBlank).toContain("<svg");
        expect(built.svgAnswers).toContain("<svg");
      }
    },
    20_000,
  );

  it("builds related internal links for each slug", () => {
    for (const ex of EXAMPLES) {
      const related = relatedExamples(ex.slug, 5);
      expect(related.length).toBeGreaterThanOrEqual(3);
      expect(related.every((r) => r.slug !== ex.slug)).toBe(true);
    }
  });

  it("example detail template includes print CTA, FAQ, and teacher/pricing links", () => {
    const detail = readFileSync(join(import.meta.dirname, "../pages/examples/[slug].astro"), "utf8");
    expect(detail).toContain("Print puzzle");
    expect(detail).toContain("window.print()");
    expect(detail).toContain("FAQPage");
    expect(detail).toContain("Make a variant with AI");
    expect(detail).toContain("/crossword-maker-for-teachers/");
    expect(detail).toContain("/pricing/");
    expect(detail).toContain("relatedExamples");
    expect(detail).toContain("blogPostsForExample");
    expect(detail).toContain("Related how-tos");
    expect(detail).toMatch(/How do I print/);
  });
});
