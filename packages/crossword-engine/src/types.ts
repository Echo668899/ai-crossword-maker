export type Direction = "across" | "down";

export type ReviewState = "needs_review" | "reviewed_by_user" | "sample" | "human_reviewed";

export type EntryOrigin =
  | "topic_ai"
  | "word_list"
  | "manual"
  | "paste"
  | "import"
  | "template"
  | "example";

export interface WordEntry {
  id: string;
  answerRaw: string;
  answerNormalized: string;
  displayAnswer: string;
  clue: string;
  difficultyTarget?: "easy" | "medium" | "hard";
  origin: EntryOrigin;
  sourceRef?: string;
  reviewState: ReviewState;
  normalizationVersion: string;
  required?: boolean;
}

export interface Cell {
  row: number;
  col: number;
  letter: string | null;
  isBlock: boolean;
  acrossNumber?: number;
  downNumber?: number;
}

export interface Placement {
  entryId: string;
  row: number;
  col: number;
  direction: Direction;
  length: number;
  number: number;
}

export interface GridSize {
  rows: number;
  cols: number;
}

export type GridSizeMode = "auto" | GridSize;

export interface BuildOptions {
  entries: WordEntry[];
  size?: GridSizeMode;
  seed: number;
  lockedPlacements?: Placement[];
  nodeBudget?: number;
  engineVersion?: string;
  allowedAutoSizes?: GridSize[];
}

export type SearchStatus =
  | "solved"
  | "partial"
  | "budget_exhausted"
  | "invalid_input"
  | "constraint_conflict"
  | "system_error";

export interface BuildResult {
  engineVersion: string;
  seed: number;
  size: GridSize;
  cells: Cell[][];
  placements: Placement[];
  placedEntryIds: string[];
  unplacedEntryIds: string[];
  crossings: number;
  nodesExplored: number;
  status: SearchStatus;
  diagnostics: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  entryIds?: string[];
  coordinates?: Array<{ row: number; col: number }>;
}

export interface ValidationReport {
  validatorVersion: string;
  snapshotHash: string;
  checkedAt: string;
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  placementCoverage: number;
  connectedComponents: number;
}

export interface NumberedPuzzle {
  size: GridSize;
  cells: Cell[][];
  placements: Placement[];
}

export const ENGINE_VERSION = "0.1.0";
export const VALIDATOR_VERSION = "0.1.0";
export const NORMALIZATION_VERSION = "0.1.0";
