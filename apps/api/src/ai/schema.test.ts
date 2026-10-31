import { describe, expect, it } from "vitest";
import { sanitizeTopicOutput, TopicModelOutputSchema } from "./schema";

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
});
