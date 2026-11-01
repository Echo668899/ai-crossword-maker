import { describe, expect, it } from "vitest";
import {
  sanitizeClueOutput,
  sanitizeTopicOutput,
  TopicModelOutputSchema,
} from "./schema";

describe("TopicModelOutputSchema", () => {
  it("accepts a valid model payload", () => {
    const parsed = TopicModelOutputSchema.safeParse({
      title: "Solar System",
      theme_blurb: "Planets and space basics",
      entries: Array.from({ length: 5 }, (_, i) => ({
        answer: `WORD${i}`,
        clue: `Clue ${i}`,
      })),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty entries", () => {
    const parsed = TopicModelOutputSchema.safeParse({
      title: "X",
      theme_blurb: "Y",
      entries: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("sanitizeTopicOutput", () => {
  it("normalizes answers and drops duplicates / short words", () => {
    const result = sanitizeTopicOutput(
      {
        title: "  Planets  ",
        theme_blurb: "Space",
        entries: [
          { answer: "mars", clue: "The red planet" },
          { answer: "MARS", clue: "Duplicate" },
          { answer: "ok", clue: "Too short" },
          { answer: "earth!", clue: "Our home" },
          { answer: "VENUS", clue: "Second planet" },
          { answer: "JUPITER", clue: "Largest planet" },
          { answer: "SATURN", clue: "Ringed planet" },
        ],
      },
      12,
    );
    expect(result.title).toBe("Planets");
    expect(result.entries.map((e) => e.answer)).toEqual([
      "MARS",
      "EARTH",
      "VENUS",
      "JUPITER",
      "SATURN",
    ]);
    expect(result.dropped).toBeGreaterThan(0);
  });

  it("caps to requested word count", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      answer: `PLANET${String.fromCharCode(65 + i)}`,
      clue: `Clue ${i}`,
    }));
    const result = sanitizeTopicOutput(
      { title: "T", theme_blurb: "B", entries },
      5,
    );
    expect(result.entries).toHaveLength(5);
  });

  it("allows empty clues for words_only style", () => {
    const result = sanitizeTopicOutput(
      {
        title: "Vocab",
        theme_blurb: "List",
        entries: [
          { answer: "MARS" },
          { answer: "EARTH" },
          { answer: "VENUS" },
          { answer: "PLUTO" },
          { answer: "COMET" },
        ],
      },
      12,
      { allowEmptyClues: true },
    );
    expect(result.entries).toHaveLength(5);
    expect(result.entries.every((e) => e.clue === "")).toBe(true);
  });

  it("still drops empty clues when words_and_clues", () => {
    const result = sanitizeTopicOutput(
      {
        title: "Vocab",
        theme_blurb: "List",
        entries: [
          { answer: "MARS", clue: "" },
          { answer: "EARTH", clue: "Our home" },
          { answer: "VENUS", clue: "Second planet" },
          { answer: "PLUTO", clue: "Dwarf planet" },
          { answer: "COMET", clue: "Icy traveler" },
        ],
      },
      12,
    );
    expect(result.entries.map((e) => e.answer)).toEqual(["EARTH", "VENUS", "PLUTO", "COMET"]);
  });
});

describe("sanitizeClueOutput", () => {
  it("keeps clues that match requested answers and drops extras", () => {
    const result = sanitizeClueOutput(
      {
        clues: [
          { answer: "mars", clue: "The red planet" },
          { answer: "PLUTO", clue: "Not requested" },
          { answer: "EARTH", clue: "" },
          { answer: "venus", clue: "Second planet" },
        ],
      },
      ["MARS", "VENUS", "EARTH"],
    );
    expect(result.clues).toEqual([
      { answer: "MARS", clue: "The red planet" },
      { answer: "VENUS", clue: "Second planet" },
    ]);
    expect(result.dropped).toBe(2);
  });
});
