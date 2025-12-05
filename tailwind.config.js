/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#05060c",
        surface: "#0d0f1a",
        "surface-muted": "#131626",
        foreground: "#e6e8f2",
        muted: "#8f96ad",
        accent: "#7c5dff",
        "accent-dark": "#6845ff",
        border: "#1f2234"
      },
      boxShadow: {
        soft: "0 10px 40px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};
