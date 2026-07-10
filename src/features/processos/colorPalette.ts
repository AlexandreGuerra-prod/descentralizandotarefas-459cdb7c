/**
 * Paleta de 9 cores do editor de processos — mesmos valores do editor
 * React Flow anterior (COLOR_BG/COLOR_BORDER em processos.$id.tsx), agora
 * mapeados para fillColor/strokeColor de estilo mxGraph.
 */
export type FlowColor =
  | "blue"
  | "coral"
  | "red"
  | "green"
  | "amber"
  | "purple"
  | "teal"
  | "pink"
  | "gray";

export const COLORS: FlowColor[] = [
  "blue",
  "coral",
  "red",
  "green",
  "amber",
  "purple",
  "teal",
  "pink",
  "gray",
];

export const COLOR_BG: Record<FlowColor, string> = {
  blue: "#dbeafe",
  coral: "#ffd6cc",
  red: "#fecaca",
  green: "#d1fae5",
  amber: "#fde68a",
  purple: "#e9d5ff",
  teal: "#ccfbf1",
  pink: "#fbcfe8",
  gray: "#e5e7eb",
};

export const COLOR_BORDER: Record<FlowColor, string> = {
  blue: "#3b82f6",
  coral: "#fb7185",
  red: "#ef4444",
  green: "#10b981",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
  gray: "#6b7280",
};

export type TextColor = "black" | "slate" | "blue" | "red" | "green";

export const TEXT_COLORS: TextColor[] = ["black", "slate", "blue", "red", "green"];

export const TEXT_COLOR: Record<TextColor, string> = {
  black: "#111827",
  slate: "#475569",
  blue: "#1d4ed8",
  red: "#b91c1c",
  green: "#15803d",
};

/** Nearest palette match for a fillColor/strokeColor pair — usado quando o
 * usuário reestiliza um nó manualmente pelo Format panel do draw.io e
 * `cor` fica desatualizado; recalcula a partir do estilo real da célula. */
export function nearestFlowColor(fillColor: string | undefined): FlowColor {
  if (fillColor == null) return "blue";
  const lower = fillColor.toLowerCase();
  const match = COLORS.find((c) => COLOR_BG[c].toLowerCase() === lower);
  return match ?? "blue";
}

export function nearestTextColor(fontColor: string | undefined): TextColor {
  if (fontColor == null) return "black";
  const lower = fontColor.toLowerCase();
  const match = TEXT_COLORS.find((c) => TEXT_COLOR[c].toLowerCase() === lower);
  return match ?? "black";
}
