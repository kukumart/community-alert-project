/** @type {import('tailwindcss').Config} */
module.exports = {
  // Configure Tailwind to scan your React component files for classes
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Look for classes in all JS/JSX/TS/TSX files inside the src directory
    "./public/index.html",       // Also scan your main HTML file
  ],
  theme: {
    extend: {
      // You can extend Tailwind's default theme here (e.g., custom colors, fonts)
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Set 'Inter' as the default sans-serif font
      },
    },
  },
  plugins: [],
}
