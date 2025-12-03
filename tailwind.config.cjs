/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "color-mix(in srgb, var(--org-primary, #7a0f18) 5%, white)",
          100: "color-mix(in srgb, var(--org-primary, #7a0f18) 10%, white)",
          200: "color-mix(in srgb, var(--org-primary, #7a0f18) 20%, white)",
          300: "color-mix(in srgb, var(--org-primary, #7a0f18) 30%, white)",
          400: "color-mix(in srgb, var(--org-primary, #7a0f18) 50%, white)",
          500: "color-mix(in srgb, var(--org-primary, #7a0f18) 70%, white)",
          600: "var(--org-primary, #7a0f18)",
          700: "color-mix(in srgb, var(--org-primary, #7a0f18) 100%, black 15%)",
          800: "color-mix(in srgb, var(--org-primary, #7a0f18) 100%, black 30%)",
          900: "color-mix(in srgb, var(--org-primary, #7a0f18) 100%, black 45%)"
        }
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)"
      },
      borderRadius: {
        '2xl': '1rem',
      }
    }
  },
  plugins: [],
};
