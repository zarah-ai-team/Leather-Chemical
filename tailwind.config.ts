import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          500: "#7c5cff",
          600: "#6d44f5",
          700: "#5b30d6",
        },
      },
    },
  },
  plugins: [],
};
export default config;
