/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f2937",
          accent: "#0a66c2", // LinkedIn blue, used sparingly
        },
      },
    },
  },
  plugins: [],
};
