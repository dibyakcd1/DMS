import { fmtINR } from "@/lib/format";

// --- Design Tokens ---
export const TOKENS = {
  brand: {
    primary: "#b45309",
    primaryLight: "#fef3c7",
    primaryDark: "#92400e",
  },
  semantic: {
    success: "#059669",
    warning: "#ca8a04",
    danger: "#dc2626",
    info: "#0284c7",
  },
  surfaces: {
    background: "#f8f7f4",
    card: "#ffffff",
    faint: "#f1f0ec",
    border: "rgba(0,0,0,0.08)",
  },
  text: {
    primary: "#1a1a1a",
    secondary: "#6b7280",
    tertiary: "#9ca3af",
  }
};

// --- Shared Types ---
export type PeriodType = 'today' | '7d' | '30d' | 'mtd' | 'qtd' | 'custom';
