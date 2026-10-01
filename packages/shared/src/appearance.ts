export const caseColorIds = [
  "graphite",
  "white",
  "silver",
  "red",
  "orange",
  "yellow",
  "green",
  "mint",
  "turquoise",
  "blue",
  "purple",
  "pink",
] as const;
export type CaseColor = (typeof caseColorIds)[number];
export const lightDarkVariants = ["light", "dark"] as const;
export const terminalVariants = ["green", "dark", "light"] as const;
export type ThemeVariant = (typeof terminalVariants)[number];
export interface ThemeVariantPreferences {
  organizerVariant?: "light" | "dark";
  crtVariant?: ThemeVariant;
  hitechVariant?: "light" | "dark";
  classicVariant?: "light" | "dark";
}
export interface CasePreferences {
  crtCaseColor?: CaseColor;
  hitechCaseColor?: CaseColor;
  organizerAccentColor?: CaseColor;
  darkAccentColor?: CaseColor;
}
