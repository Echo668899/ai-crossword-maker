import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";

const pagesRoot = join(import.meta.dirname, "../pages");

function collectAstro(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectAstro(full, out);
    else if (name.endsWith(".astro")) out.push(full);
  }
  return out;
}

describe("SEO shell hardening", () => {
  it("keeps robots disallowing app/admin/login/play while allowing public SEO", () => {
    const robots = readFileSync(join(import.meta.dirname, "../../public/robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /app/");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain("Disallow: /p/");
    expect(robots).toContain("Disallow: /login/");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap:");
  });

  it("excludes app/admin/login/play/404 from the sitemap integration filter", () => {
    const cfg = readFileSync(join(import.meta.dirname, "../../astro.config.mjs"), "utf8");
    expect(cfg).toContain("@astrojs/sitemap");
    expect(cfg).toContain('"/admin/"');
    expect(cfg).toContain('"/app/"');
    expect(cfg).toContain('"/login/"');
    expect(cfg).toContain('"/p/"');
    expect(cfg).toContain('"/404"');
  });

  it("teachers and printable pages advertise name-line presets and cross CTAs", () => {
    const teachers = readFileSync(join(pagesRoot, "crossword-maker-for-teachers/index.astro"), "utf8");
    const printable = readFileSync(join(pagesRoot, "printable-crossword-maker/index.astro"), "utf8");
    expect(teachers).toContain('initialNameLinePreset="name-class-date"');
    expect(teachers).toContain("/blog/how-to-make-a-crossword-puzzle/");
    expect(teachers).toContain("/esl-crossword-generator/");
    expect(teachers).toContain("/printable-crossword-maker/");
    expect(teachers).toContain("/blog/how-to-print-crossword-worksheets/");
    expect(teachers).toContain("teachers-printable-cta");
    expect(printable).toContain("Name line presets");
    expect(printable).toContain("/blog/how-to-make-a-crossword-puzzle/");
    expect(printable).toContain("/crossword-maker-for-teachers/");
    expect(printable).toContain("/blog/how-to-print-crossword-worksheets/");
    expect(printable).toContain("printable-teachers-cta");
    expect(printable).toContain("FAQPage");
  });

  it("marks legal pages as operator-entity placeholders without inventing a company", () => {
    for (const page of ["privacy", "terms", "refund-policy", "contact"]) {
      const src = readFileSync(join(pagesRoot, `${page}/index.astro`), "utf8");
      expect(src).toMatch(/TO BE FILLED/);
      expect(src).toMatch(/Do not invent/i);
      expect(src).not.toMatch(/Acme Legal LLC|Fake Corp|Example Inc\./i);
    }
    const admin = readFileSync(join(pagesRoot, "admin/index.astro"), "utf8");
    expect(admin).toContain("noindex={true}");
  });

  it("rewrites share play URLs without indexing answers in HTML shell", () => {
    const redirects = readFileSync(join(import.meta.dirname, "../../public/_redirects"), "utf8");
    expect(redirects).toMatch(/\/p\/\*\s+\/p\/_\/index\.html\s+200/);
    expect(redirects).toMatch(/\/app\/packs\/\*/);
  });

  it("has no Chinese locale marketing routes", () => {
    const files = collectAstro(pagesRoot);
    const rel = files.map((f) => f.slice(pagesRoot.length));
    expect(rel.some((p) => /\/zh(\/|$)/i.test(p) || /chinese/i.test(p))).toBe(false);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/lang=["']zh/i);
    }
  });

  it("examples index and detail pages carry canonical + sample labeling hooks", () => {
    const indexSrc = readFileSync(join(pagesRoot, "examples/index.astro"), "utf8");
    const detailSrc = readFileSync(join(pagesRoot, "examples/[slug].astro"), "utf8");
    expect(indexSrc).toContain('canonicalPath="/examples/"');
    expect(indexSrc).toContain("ItemList");
    expect(indexSrc).toContain("Free printable");
    expect(detailSrc).toContain("FAQPage");
    expect(detailSrc).toContain("BreadcrumbList");
    expect(detailSrc).toContain("Make a variant with AI");
    expect(detailSrc).toContain("Answer key");
    expect(detailSrc).toContain("Print puzzle");
    expect(detailSrc).toContain("no-print");
    const globalCss = readFileSync(join(import.meta.dirname, "../styles/global.css"), "utf8");
    expect(globalCss).toContain("@media print");
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(20);
  });

  it("deepens ESL/CEFR landings and ships crawlable how-to blog posts", () => {
    const esl = readFileSync(join(pagesRoot, "esl-crossword-generator/index.astro"), "utf8");
    const cefr = readFileSync(join(pagesRoot, "cefr-crossword/index.astro"), "utf8");
    const blogIndex = readFileSync(join(pagesRoot, "blog/index.astro"), "utf8");
    const howto = readFileSync(join(pagesRoot, "blog/how-to-make-a-crossword-puzzle/index.astro"), "utf8");
    const eslHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-esl-vocabulary-crosswords/index.astro"),
      "utf8",
    );
    const printHowto = readFileSync(
      join(pagesRoot, "blog/how-to-print-crossword-worksheets/index.astro"),
      "utf8",
    );

    expect(esl).toContain('canonicalPath="/esl-crossword-generator/"');
    expect(esl).toContain("CEFR_PRESETS");
    expect(esl).toContain("FAQPage");
    expect(esl).toContain('id="maker"');
    expect(esl).not.toMatch(/CEFR selectors deepen in v1\.1/);

    expect(cefr).toContain('canonicalPath="/cefr-crossword/"');
    expect(cefr).toContain("CEFR_PRESETS");
    expect(cefr).toContain("FAQPage");
    expect(cefr).not.toMatch(/Astro\.redirect/);

    expect(blogIndex).toContain('canonicalPath="/blog/"');
    expect(blogIndex).toContain("ItemList");
    expect(blogIndex).toContain("BLOG_POSTS");
    expect(blogIndex).toContain("/examples/irregular-verbs/");
    const blogCatalog = readFileSync(join(import.meta.dirname, "blog-posts.ts"), "utf8");
    expect(blogCatalog).toContain("how-to-print-crossword-worksheets");
    expect(blogCatalog).toContain("how-to-make-a-crossword-puzzle");
    expect(blogCatalog).toContain("how-to-make-esl-vocabulary-crosswords");
    expect(howto).toContain("/ai-crossword-maker/");
    expect(howto).toContain("@type\": \"Article\"");
    expect(howto).toContain("blog-posts");
    expect(eslHowto).toContain("/esl-crossword-generator/");
    expect(eslHowto).toContain("/examples/esl-daily-routines/");
    expect(eslHowto).toContain("/examples/irregular-verbs/");
    expect(printHowto).toContain("/printable-crossword-maker/");
    expect(printHowto).toContain("/crossword-maker-for-teachers/");
    expect(printHowto).toContain("@type\": \"Article\"");
    expect(printHowto).toContain("/examples/animal-habitats/");
    expect(EXAMPLES.some((e) => e.slug === "esl-daily-routines")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "esl-jobs-and-work")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "greek-mythology")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "renewable-energy")).toBe(true);
  });

  it("wires example detail pages into the blog how-to mesh", () => {
    const detailSrc = readFileSync(join(pagesRoot, "examples/[slug].astro"), "utf8");
    expect(detailSrc).toContain("blogPostsForExample");
    expect(detailSrc).toContain("Related how-tos");
    const maker = readFileSync(
      join(import.meta.dirname, "../components/maker/MakerApp.tsx"),
      "utf8",
    );
    expect(maker).toContain("TOPIC_QUICK_PICKS");
    expect(maker).toContain("Quick classroom topics");
    expect(maker).toContain("emptyHint");
  });
});
