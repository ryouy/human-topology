import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1419",
          raised: "#161c24",
          border: "#243042",
        },
        accent: { DEFAULT: "#3b82f6", muted: "#1d4ed8" },
      },
    },
  },
  plugins: [],
};

export default config;
