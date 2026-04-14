import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 머더미스터리 테마 컬러
        mystery: {
          50: "#f8efee",
          100: "#f2ddda",
          200: "#e6bcb6",
          300: "#da9a92",
          400: "#cb6c65",
          500: "#b72d29",
          600: "#98201f",
          700: "#771919",
          800: "#561416",
          900: "#3a1014",
          950: "#2a0d12",
        },
        dark: {
          50: "#f3f1f0",
          100: "#ddd7d4",
          200: "#beb3ae",
          300: "#988a87",
          400: "#756d6c",
          500: "#595556",
          600: "#414142",
          700: "#2a2e2f",
          800: "#211b1f",
          900: "#170f12",
          950: "#0f090c",
        },
        sage: {
          50: "#edf1ee",
          100: "#d7ded9",
          200: "#b4c0b7",
          300: "#91a393",
          400: "#718374",
          500: "#57645b",
          600: "#445149",
          700: "#353f39",
          800: "#252d28",
          900: "#171d1a",
          950: "#0d110f",
        },
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "card-flip": "cardFlip 0.6s ease-in-out",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "toast-in": "toastIn 0.45s ease-out",
        "toast-out": "toastOut 0.8s ease-in forwards",
      },
      keyframes: {
        cardFlip: {
          "0%": { transform: "rotateY(0deg)" },
          "50%": { transform: "rotateY(90deg)" },
          "100%": { transform: "rotateY(0deg)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        toastIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        toastOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
