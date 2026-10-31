/** Paper-workbench design tokens (non cream/terracotta, non purple neon). */
export const tokens = {
  color: {
    bg: "#F5F7FA",
    ink: "#1C2430",
    primary: "#2F5C8F",
    primaryHover: "#244A73",
    border: "#D5DCE6",
    muted: "#5B6777",
    surface: "#FFFFFF",
    success: "#1F6B4A",
    danger: "#9B2C2C",
    warn: "#8A6D1F",
  },
  font: {
    display: '"Fraunces", "Source Serif 4", Georgia, serif',
    body: '"Source Sans 3", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  radius: {
    sm: "4px",
    md: "8px",
  },
  siteUrl: "https://aicrosswordmaker.com",
  brandName: "AI Crossword Maker",
  tagline: "From a topic to a printable crossword — AI writes the clues, you edit and print.",
} as const;

export type DesignTokens = typeof tokens;
