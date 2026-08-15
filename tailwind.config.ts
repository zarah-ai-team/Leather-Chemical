import type { Config } from "tailwindcss";

// Zarah AI brand guidelines v1.0 — carbon + paper + one yellow accent.
// brand-500/600 are the spec's exact yellow/500 (#F5C518) and yellow/600
// (#D9A916) hover tone; 700 is a darker derivative used only where the
// accent needs to work as body text (yellow/500-600 fail WCAG contrast
// on white — text on yellow itself must stay carbon per the guide).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#facc15",
          500: "#f5c518",
          600: "#d9a916",
          700: "#8a6d0f",
        },
        carbon: {
          50: "#f5f5f5",
          100: "#e5e5e5",
          300: "#d4d4d4",
          500: "#737373",
          800: "#232323",
          900: "#171717",
        },
        paper: {
          0: "#ffffff",
          50: "#fafaf7",
        },
      },
    },
  },
  plugins: [],
};
export default config;
