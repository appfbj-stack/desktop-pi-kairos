/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Paleta Kairós (definida no briefing §8, Q7).
        // slate-900 + emerald-500 + amber-500.
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
