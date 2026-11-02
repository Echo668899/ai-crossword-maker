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
    expect(robots).toContain("Disallow: /examples/*/play/");
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
    expect(cfg).toContain('"/play/"');
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

  it("fills legal pages with individual-operator copy without inventing a company", () => {
    for (const page of ["privacy", "terms", "refund-policy", "contact"]) {
      const src = readFileSync(join(pagesRoot, `${page}/index.astro`), "utf8");
      expect(src).not.toMatch(/TO BE FILLED/);
      expect(src).toMatch(/support@crosswordmaker\.app/);
      expect(src).toMatch(/individual operator|operator of crosswordmaker\.app/i);
      expect(src).toMatch(/Last updated:\s*2026-11-01/);
      expect(src).not.toMatch(/Acme Legal LLC|Fake Corp|Example Inc\.|Delaware LLC/i);
    }
    const refund = readFileSync(join(pagesRoot, "refund-policy/index.astro"), "utf8");
    expect(refund).toMatch(/generation fail/i);
    expect(refund).toMatch(/non-refundable/i);
    const contact = readFileSync(join(pagesRoot, "contact/index.astro"), "utf8");
    expect(contact).toMatch(/email only/i);
    const terms = readFileSync(join(pagesRoot, "terms/index.astro"), "utf8");
    expect(terms).toMatch(/consumer-protection|consumer law/i);
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
    const playSrc = readFileSync(join(pagesRoot, "examples/[slug]/play/index.astro"), "utf8");
    expect(indexSrc).toContain('canonicalPath="/examples/"');
    expect(indexSrc).toContain("ItemList");
    expect(indexSrc).toContain("Free printable");
    expect(indexSrc).toContain("Play sample");
    expect(detailSrc).toContain("FAQPage");
    expect(detailSrc).toContain("BreadcrumbList");
    expect(detailSrc).toContain("Make a variant with AI");
    expect(detailSrc).toContain("Answer key");
    expect(detailSrc).toContain("Print puzzle");
    expect(detailSrc).toContain("Play this sample");
    expect(detailSrc).toContain("no-print");
    expect(playSrc).toContain("noindex={true}");
    expect(playSrc).toContain("exampleToLocalPlay");
    expect(playSrc).toContain("localDemo");
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
    const wordListHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-crossword-from-a-word-list/index.astro"),
      "utf8",
    );
    const wordList = readFileSync(join(pagesRoot, "crossword-maker-from-word-list/index.astro"), "utf8");

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
    expect(blogIndex).toContain("/examples/electricity/");
    expect(blogIndex).toContain("/crossword-maker-from-word-list/");
    const blogCatalog = readFileSync(join(import.meta.dirname, "blog-posts.ts"), "utf8");
    expect(blogCatalog).toContain("how-to-print-crossword-worksheets");
    expect(blogCatalog).toContain("how-to-make-a-crossword-puzzle");
    expect(blogCatalog).toContain("how-to-make-esl-vocabulary-crosswords");
    expect(blogCatalog).toContain("how-to-make-a-crossword-from-a-word-list");
    expect(blogCatalog).toContain("how-to-make-a-science-vocabulary-crossword");
    expect(blogCatalog).toContain("how-to-make-a-crossword-from-a-spelling-list");
    expect(blogCatalog).toContain("how-to-make-a-math-vocabulary-crossword");
    expect(blogCatalog).toContain("how-to-make-a-social-studies-vocabulary-crossword");
    expect(blogCatalog).toContain("how-to-make-a-history-vocabulary-crossword");
    expect(blogCatalog).toContain("how-to-make-a-geography-vocabulary-crossword");
    const scienceHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-science-vocabulary-crossword/index.astro"),
      "utf8",
    );
    expect(scienceHowto).toContain("/ai-crossword-maker/");
    expect(scienceHowto).toContain("@type\": \"Article\"");
    expect(scienceHowto).toContain("/examples/rock-cycle/");
    const spellingHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-crossword-from-a-spelling-list/index.astro"),
      "utf8",
    );
    expect(spellingHowto).toContain("/crossword-maker-from-word-list/");
    expect(spellingHowto).toContain("@type\": \"Article\"");
    expect(spellingHowto).toContain("/examples/homophones/");
    const mathHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-math-vocabulary-crossword/index.astro"),
      "utf8",
    );
    expect(mathHowto).toContain("/ai-crossword-maker/");
    expect(mathHowto).toContain("@type\": \"Article\"");
    expect(mathHowto).toContain("/examples/measurement/");
    const socialHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-social-studies-vocabulary-crossword/index.astro"),
      "utf8",
    );
    expect(socialHowto).toContain("/ai-crossword-maker/");
    expect(socialHowto).toContain("@type\": \"Article\"");
    expect(socialHowto).toContain("/examples/branches-of-government/");
    const historyHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-history-vocabulary-crossword/index.astro"),
      "utf8",
    );
    expect(historyHowto).toContain("/ai-crossword-maker/");
    expect(historyHowto).toContain("@type\": \"Article\"");
    expect(historyHowto).toContain("/examples/thirteen-colonies/");
    const geographyHowto = readFileSync(
      join(pagesRoot, "blog/how-to-make-a-geography-vocabulary-crossword/index.astro"),
      "utf8",
    );
    expect(geographyHowto).toContain("/ai-crossword-maker/");
    expect(geographyHowto).toContain("@type\": \"Article\"");
    expect(geographyHowto).toContain("/examples/map-skills/");
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
    expect(wordListHowto).toContain("/crossword-maker-from-word-list/");
    expect(wordListHowto).toContain("@type\": \"Article\"");
    expect(wordListHowto).toContain("/examples/classroom-objects/");
    expect(wordListHowto).toContain("/examples/irregular-verbs/");
    expect(wordList).toContain("FAQPage");
    expect(wordList).toContain('initialMode="words"');
    expect(wordList).toContain("/blog/how-to-make-a-crossword-from-a-word-list/");
    expect(wordList).toContain("wordlist-howto-cta");
    expect(EXAMPLES.some((e) => e.slug === "esl-daily-routines")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "esl-jobs-and-work")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "greek-mythology")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "renewable-energy")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "states-of-matter")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "telling-time")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "rock-cycle")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "geometry-shapes")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "simple-machines")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "homophones")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "phases-of-the-moon")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "force-and-motion")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "measurement")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "life-cycles")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "ecosystems")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "magnets")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "figurative-language")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "decimals")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "natural-resources")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "volcanoes")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "thirteen-colonies")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "compound-words")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "area-and-perimeter")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "biomes")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "electricity")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "westward-expansion")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "root-words")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "multiplication")).toBe(true);
    expect(EXAMPLES.some((e) => e.slug === "fossils")).toBe(true);
  });

  it("ships honest comparison pages without AggregateRating fiction", () => {
    const vsHub = readFileSync(join(pagesRoot, "vs/index.astro"), "utf8");
    const vsLabs = readFileSync(join(pagesRoot, "vs/crossword-labs/index.astro"), "utf8");
    const vsMcm = readFileSync(join(pagesRoot, "vs/my-crossword-maker/index.astro"), "utf8");
    const vsEclipse = readFileSync(join(pagesRoot, "vs/eclipse-crossword/index.astro"), "utf8");
    const vsDiscovery = readFileSync(
      join(pagesRoot, "vs/discovery-education-puzzlemaker/index.astro"),
      "utf8",
    );
    const vsArmored = readFileSync(join(pagesRoot, "vs/armored-penguin/index.astro"), "utf8");
    const vsEasy = readFileSync(join(pagesRoot, "vs/easy-puzzle-maker/index.astro"), "utf8");
    const vsTeachers = readFileSync(join(pagesRoot, "vs/teachers-corner/index.astro"), "utf8");
    const blogIndex = readFileSync(join(pagesRoot, "blog/index.astro"), "utf8");
    const pricing = readFileSync(join(pagesRoot, "pricing/index.astro"), "utf8");
    const footer = readFileSync(join(import.meta.dirname, "../layouts/BaseLayout.astro"), "utf8");
    expect(vsHub).toContain('canonicalPath="/vs/"');
    expect(vsHub).toContain("ItemList");
    expect(vsHub).toContain("/vs/my-crossword-maker/");
    expect(vsHub).toContain("/vs/eclipse-crossword/");
    expect(vsHub).toContain("/vs/discovery-education-puzzlemaker/");
    expect(vsHub).toContain("/vs/armored-penguin/");
    expect(vsHub).toContain("/vs/easy-puzzle-maker/");
    expect(vsHub).toContain("/vs/teachers-corner/");
    expect(vsLabs).toContain('canonicalPath="/vs/crossword-labs/"');
    expect(vsLabs).toContain("FAQPage");
    expect(vsLabs).toContain("Crossword Labs alternative");
    expect(vsLabs).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsLabs).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsMcm).toContain('canonicalPath="/vs/my-crossword-maker/"');
    expect(vsMcm).toContain("FAQPage");
    expect(vsMcm).toContain("My Crossword Maker alternative");
    expect(vsMcm).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsMcm).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsEclipse).toContain('canonicalPath="/vs/eclipse-crossword/"');
    expect(vsEclipse).toContain("FAQPage");
    expect(vsEclipse).toContain("Eclipse Crossword alternative");
    expect(vsEclipse).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsEclipse).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsDiscovery).toContain('canonicalPath="/vs/discovery-education-puzzlemaker/"');
    expect(vsDiscovery).toContain("FAQPage");
    expect(vsDiscovery).toContain("Discovery Education Puzzlemaker alternative");
    expect(vsDiscovery).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsDiscovery).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsArmored).toContain('canonicalPath="/vs/armored-penguin/"');
    expect(vsArmored).toContain("FAQPage");
    expect(vsArmored).toContain("Armored Penguin alternative");
    expect(vsArmored).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsArmored).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsEasy).toContain('canonicalPath="/vs/easy-puzzle-maker/"');
    expect(vsEasy).toContain("FAQPage");
    expect(vsEasy).toContain("Easy Puzzle Maker alternative");
    expect(vsEasy).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsEasy).not.toMatch(/ratingValue|reviewCount/i);
    expect(vsTeachers).toContain('canonicalPath="/vs/teachers-corner/"');
    expect(vsTeachers).toContain("FAQPage");
    expect(vsTeachers).toContain("Teacher's Corner alternative");
    expect(vsTeachers).not.toMatch(/"@type"\s*:\s*"AggregateRating"/);
    expect(vsTeachers).not.toMatch(/ratingValue|reviewCount/i);
    expect(blogIndex).toContain("/vs/");
    expect(blogIndex).toContain("/vs/my-crossword-maker/");
    expect(blogIndex).toContain("/vs/crossword-labs/");
    expect(blogIndex).toContain("/vs/eclipse-crossword/");
    expect(blogIndex).toContain("/vs/discovery-education-puzzlemaker/");
    expect(blogIndex).toContain("/vs/armored-penguin/");
    expect(blogIndex).toContain("/vs/easy-puzzle-maker/");
    expect(blogIndex).toContain("/vs/teachers-corner/");
    expect(pricing).toContain("/vs/my-crossword-maker/");
    expect(pricing).toContain("/vs/crossword-labs/");
    expect(pricing).toContain("/vs/eclipse-crossword/");
    expect(pricing).toContain("/vs/discovery-education-puzzlemaker/");
    expect(pricing).toContain("/vs/armored-penguin/");
    expect(pricing).toContain("/vs/easy-puzzle-maker/");
    expect(pricing).toContain("/vs/teachers-corner/");
    expect(footer).toContain("/vs/");
    expect(footer).toContain("/vs/my-crossword-maker/");
    expect(footer).toContain("/vs/crossword-labs/");
    expect(footer).toContain("/vs/eclipse-crossword/");
    expect(footer).toContain("/vs/discovery-education-puzzlemaker/");
    expect(footer).toContain("/vs/armored-penguin/");
    expect(footer).toContain("/vs/easy-puzzle-maker/");
    expect(footer).toContain("/vs/teachers-corner/");
  });

  it("wires example detail pages into the blog how-to mesh", () => {
    const detailSrc = readFileSync(join(pagesRoot, "examples/[slug].astro"), "utf8");
    expect(detailSrc).toContain("blogPostsForExample");
    expect(detailSrc).toContain("Related how-tos");
    const examplesIndex = readFileSync(join(pagesRoot, "examples/index.astro"), "utf8");
    expect(examplesIndex).toContain("LONG_TAIL_BATCH_8_SLUGS");
    expect(examplesIndex).toContain("subjectJump");
    const maker = readFileSync(
      join(import.meta.dirname, "../components/maker/MakerApp.tsx"),
      "utf8",
    );
    expect(maker).toContain("TOPIC_QUICK_PICKS");
    expect(maker).toContain("Quick classroom topics");
    expect(maker).toContain("EXAMPLE_SEED_SLUGS");
    expect(maker).toContain("Load example seed");
    expect(maker).toContain("emptyHint");
    expect(maker).toContain("TEACHER_CLASSROOM_ENTRIES");
    expect(maker).toContain("Load classroom sample");
    expect(maker).toContain("/blog/how-to-make-a-crossword-from-a-word-list/");
    expect(maker).toContain("/examples/electricity/");
    expect(maker).toContain("/blog/how-to-make-a-geography-vocabulary-crossword/");
    expect(maker).toContain("requireFreshGrid");
    expect(maker).toContain("outputsLocked");
    expect(maker).toContain("Rebuild needed");
    expect(maker).toContain("Skipped:");
    expect(maker).toContain("sourceRowsForBuild");
    expect(maker).toContain("gridCheckStatus");
    expect(maker).toContain("Prompt hint only");
  });

  it("does not claim an in-maker Letter/A4 selector or CEFR-certified difficulty", () => {
    const printable = readFileSync(join(pagesRoot, "printable-crossword-maker/index.astro"), "utf8");
    const teachers = readFileSync(join(pagesRoot, "crossword-maker-for-teachers/index.astro"), "utf8");
    const printHowto = readFileSync(
      join(pagesRoot, "blog/how-to-print-crossword-worksheets/index.astro"),
      "utf8",
    );
    const esl = readFileSync(join(pagesRoot, "esl-crossword-generator/index.astro"), "utf8");
    const cefr = readFileSync(join(pagesRoot, "cefr-crossword/index.astro"), "utf8");
    expect(printable).not.toMatch(/<li>US Letter and A4<\/li>/);
    expect(printable).toContain("no in-maker paper-size selector yet");
    expect(teachers).not.toMatch(/fine-tune Letter vs A4/);
    expect(printHowto).not.toContain("Choose the paper size in the export panel");
    expect(printHowto).toContain("There is no Letter/A4 selector in the maker yet");
    expect(esl).toContain("prompt hint, not a CEFR rating");
    expect(cefr).toContain("do not certify CEFR level");
  });
});
