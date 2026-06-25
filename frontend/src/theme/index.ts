/**
 * Cemara Kopi POS - Design Tokens
 * Brand: Premium Coffee Shop / Material 3 inspired.
 */

export const COLORS = {
  light: {
    surface: "#F7F7F7",
    surfaceSecondary: "#FFFFFF",
    surfaceTertiary: "#EFEAE4",
    onSurface: "#1D1B20",
    onSurfaceMuted: "#6B6873",
    brand: "#2E7D32",
    brandDark: "#1B5E20",
    brandSoft: "#E8F2E9",
    onBrand: "#FFFFFF",
    secondary: "#4E342E",
    secondarySoft: "#EFEAE7",
    onSecondary: "#FFFFFF",
    accent: "#D4A017",
    accentSoft: "#FBF1D3",
    onAccent: "#FFFFFF",
    success: "#2E7D32",
    warning: "#B26A00",
    error: "#BA1A1A",
    info: "#00639B",
    border: "#E0DCD6",
    divider: "#EEEAE4",
    shadow: "rgba(78, 52, 46, 0.10)",
  },
};

export type ThemeColors = typeof COLORS.light;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADII = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const FONT = {
  display: "System",
  text: "System",
  sizes: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 16,
    xl: 18,
    xxl: 22,
    huge: 28,
  },
};

export const SHADOW = {
  card: {
    shadowColor: "#4E342E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  fab: {
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const formatRp = (n: number) => {
  if (isNaN(n)) return "Rp0";
  return "Rp" + Math.round(n).toLocaleString("id-ID");
};
