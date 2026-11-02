import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import worker, { rewriteAssetPath } from "../../public/_worker.js";

const publicDir = join(import.meta.dirname, "../../public");

describe("share / pack / edit asset rewrites", () => {
  it("maps tokenized pretty URLs onto SSG shells and leaves real pages alone", () => {
    expect(rewriteAssetPath("/p/abc123/")).toBe("/p/_/");
    expect(rewriteAssetPath("/p/abc123")).toBe("/p/_/");
    expect(rewriteAssetPath("/p/_/")).toBeNull();
    expect(rewriteAssetPath("/p/_")).toBeNull();
    expect(rewriteAssetPath("/p/")).toBeNull();
    expect(rewriteAssetPath("/p/abc/extra")).toBeNull();
    expect(rewriteAssetPath("/login/")).toBeNull();
    expect(rewriteAssetPath("/examples/solar-system/")).toBeNull();

    expect(rewriteAssetPath("/app/packs/pack-1/")).toBe("/app/packs/_/");
    expect(rewriteAssetPath("/app/packs/_/")).toBeNull();
    expect(rewriteAssetPath("/app/puzzles/pz-1/edit/")).toBe("/app/puzzles/_/edit/");
    expect(rewriteAssetPath("/app/puzzles/_/edit/")).toBeNull();
    expect(rewriteAssetPath("/app/puzzles/pz-1/")).toBeNull();
  });

  it("fetches the play shell without changing unknown-page 404 pass-through", async () => {
    const fetched: string[] = [];
    const env = {
      ASSETS: {
        fetch: async (input: Request) => {
          fetched.push(new URL(input.url).pathname);
          return new Response("ok", { status: 200 });
        },
      },
    };

    const play = await worker.fetch(new Request("https://crosswordmaker.app/p/tok_en-1/"), env);
    expect(play.status).toBe(200);
    expect(fetched).toEqual(["/p/_/"]);

    fetched.length = 0;
    const missing = await worker.fetch(new Request("https://crosswordmaker.app/no-such-page/"), env);
    expect(missing.status).toBe(200);
    expect(fetched).toEqual(["/no-such-page/"]);
  });

  it("ships _worker.js and pretty-path _redirects for Pages", () => {
    expect(existsSync(join(publicDir, "_worker.js"))).toBe(true);
    const redirects = readFileSync(join(publicDir, "_redirects"), "utf8");
    expect(redirects).toMatch(/\/p\/:token\/\s+\/p\/_\/\s+200/);
    const redirectRules = redirects
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .join("\n");
    expect(redirectRules).not.toMatch(/index\.html/);
  });
});
