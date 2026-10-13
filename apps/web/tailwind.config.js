/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kairos: {
          deep: "#0a1d3a",   // azul-marinho principal
          base: "#102b5b",   // base
          bright: "#1e6fff", // azul luminoso
          neon: "#22ffb3",   // verde neon destaque
          amber: "#ffb43a",  // amber acento
          ink: "#0c1430",    // texto sobre fundo claro
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
