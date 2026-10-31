export type NameLinePreset = "name-date" | "name-class-date" | "name-period-date" | "none";

export const NAME_LINE_PRESETS: ReadonlyArray<{
  id: NameLinePreset;
  label: string;
  description: string;
}> = [
  {
    id: "name-date",
    label: "Name + Date",
    description: "Classic student handout header",
  },
  {
    id: "name-class-date",
    label: "Name + Class + Date",
    description: "Homeroom or subject class packets",
  },
  {
    id: "name-period-date",
    label: "Name + Period + Date",
    description: "Middle/high school period schedules",
  },
  {
    id: "none",
    label: "No name line",
    description: "Title-only sheet (no blanks)",
  },
];

/** PDF header text for teacher name-line presets (Helvetica-safe ASCII). */
export function nameLineText(preset: NameLinePreset): string | null {
  switch (preset) {
    case "name-date":
      return "Name: ______________________  Date: __________";
    case "name-class-date":
      return "Name: ______________  Class: ________  Date: ________";
    case "name-period-date":
      return "Name: ______________  Period: ____  Date: ________";
    case "none":
      return null;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** Resolve preset from explicit value or legacy showNameDate boolean. */
export function resolveNameLinePreset(input: {
  nameLinePreset?: NameLinePreset;
  showNameDate?: boolean;
}): NameLinePreset {
  if (input.nameLinePreset) return input.nameLinePreset;
  if (input.showNameDate === false) return "none";
  return "name-date";
}
