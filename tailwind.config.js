/** @type {import('tailwindcss').Config} */
export default {
  // darkMode left at the default ('media') to preserve current behavior — the
  // app's light/dark toggle is driven by conditional class strings, not the
  // Tailwind `dark:` variant.
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
