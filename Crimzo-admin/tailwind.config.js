/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        crimzo: {
          DEFAULT: '#FF2D55',
          dark: '#E01B4B',
          light: '#FF5C77',
        },
        dark: {
          bg: '#08080C',
          card: '#12121D',
          border: '#1E1E2D'
        }
      }
    },
  },
  plugins: [],
}
