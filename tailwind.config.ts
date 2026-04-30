import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        yellow: "#FFDD0C",
        navy: "#0A1428",
        card: "#0D1B35",
        elevated: "#112040",
        "cloud-white": "#FAFAFA",
        ua: "#54F0A3",
        "ua-glow": "#68E6B5",
        "icon-bg": "#0B1020",
        organic: "#926FDE",
        creative: "#F88673",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "system-ui", "sans-serif"],
        body: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Mirrors --text-* tokens from globals.css.
        xs: "11px",
        sm: "13px",
        base: "15px",
        md: "17px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
        "3xl": "40px",
        "4xl": "56px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      borderColor: {
        subtle: "rgba(255,255,255,0.08)",
        default: "rgba(255,255,255,0.15)",
        strong: "rgba(255,255,255,0.30)",
        glass: "rgba(255,255,255,0.10)",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.35)",
        elevated: "0 8px 40px rgba(0,0,0,0.50)",
        glass:
          "0 4px 24px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.08)",
        yellow: "0 0 24px rgba(255,221,12,0.20)",
        mint:
          "0 0 20px rgba(84,240,163,0.20), 0 0 40px rgba(84,240,163,0.08)",
        "mint-strong":
          "0 0 12px rgba(84,240,163,0.35), 0 0 32px rgba(84,240,163,0.15)",
      },
      backdropBlur: {
        glass: "16px",
      },
      backdropSaturate: {
        160: "1.6",
      },
      transitionTimingFunction: {
        enter: "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      ringColor: {
        DEFAULT: "#FFDD0C",
      },
      keyframes: {
        "mint-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(84,240,163,0.55)" },
          "50%": { boxShadow: "0 0 0 9px rgba(84,240,163,0)" },
        },
        "card-enter": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "bulb-float": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-10px) rotate(1.5deg)" },
        },
      },
      animation: {
        "mint-pulse": "mint-pulse 2s ease-in-out infinite",
        "card-enter": "card-enter 350ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "bulb-float": "bulb-float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
