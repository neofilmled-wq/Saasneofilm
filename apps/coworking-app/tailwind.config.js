/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neo: {
          red: '#E63946',
          'red-deep': '#b71c2c',
        },
      },
    },
  },
  plugins: [],
};
