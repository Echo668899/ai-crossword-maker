/** CEFR level presets for ESL / CEFR landing pages (English copy only). */

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type MakerDifficulty = "easy" | "medium" | "hard";

export interface CefrPreset {
  level: CefrLevel;
  label: string;
  blurb: string;
  /** Topic string prefilled into Topic (AI) mode. */
  topic: string;
  difficulty: MakerDifficulty;
  wordCountHint: string;
  exampleSlugs: string[];
  /** Query path under /esl-crossword-generator/ or /cefr-crossword/ */
  makerQuery: string;
}

export const CEFR_PRESETS: CefrPreset[] = [
  {
    level: "A1",
    label: "A1 Beginner",
    blurb: "Concrete everyday nouns and short definition clues — food, classroom, seasons.",
    topic: "A1 ESL beginner vocabulary: food, classroom objects, and seasons",
    difficulty: "easy",
    wordCountHint: "8–12 short words",
    exampleSlugs: ["esl-food-vocabulary", "classroom-objects", "seasons"],
    makerQuery: "topic=A1+ESL+beginner+vocabulary%3A+food%2C+classroom+objects%2C+and+seasons&difficulty=easy",
  },
  {
    level: "A2",
    label: "A2 Elementary",
    blurb: "Travel, daily routines, and simple jobs — still concrete, slightly longer answers.",
    topic: "A2 ESL elementary vocabulary: travel, daily routines, and jobs",
    difficulty: "easy",
    wordCountHint: "10–14 words",
    exampleSlugs: ["esl-travel-phrases", "esl-daily-routines", "esl-jobs-and-work"],
    makerQuery: "topic=A2+ESL+elementary+vocabulary%3A+travel%2C+daily+routines%2C+and+jobs&difficulty=easy",
  },
  {
    level: "B1",
    label: "B1 Intermediate",
    blurb: "School subjects, weather systems, and health basics with fuller definition clues.",
    topic: "B1 ESL intermediate vocabulary: school subjects, weather, and health",
    difficulty: "medium",
    wordCountHint: "12–16 words",
    exampleSlugs: ["weather", "human-body-organs", "esl-daily-routines"],
    makerQuery: "topic=B1+ESL+intermediate+vocabulary%3A+school+subjects%2C+weather%2C+and+health&difficulty=medium",
  },
  {
    level: "B2",
    label: "B2 Upper-intermediate",
    blurb: "Science and civics themes with denser clues — still classroom-safe, not cryptic.",
    topic: "B2 ESL upper-intermediate vocabulary: environment, science, and civic life",
    difficulty: "medium",
    wordCountHint: "12–18 words",
    exampleSlugs: ["earth-day", "water-cycle", "american-revolution"],
    makerQuery:
      "topic=B2+ESL+upper-intermediate+vocabulary%3A+environment%2C+science%2C+and+civic+life&difficulty=medium",
  },
  {
    level: "C1",
    label: "C1 Advanced",
    blurb: "Richer academic themes (history, chemistry intro). Always review AI clues before class.",
    topic: "C1 ESL advanced academic vocabulary: history, science, and abstract nouns",
    difficulty: "hard",
    wordCountHint: "14–20 words",
    exampleSlugs: ["periodic-table-basics", "american-revolution", "shakespeare-characters"],
    makerQuery:
      "topic=C1+ESL+advanced+academic+vocabulary%3A+history%2C+science%2C+and+abstract+nouns&difficulty=hard",
  },
];

export function cefrMakerHref(basePath: "/esl-crossword-generator/" | "/cefr-crossword/", preset: CefrPreset) {
  return `${basePath}?${preset.makerQuery}#maker`;
}
