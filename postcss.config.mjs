import tailwindcss from "@tailwindcss/postcss";
import typography from "@tailwindcss/typography";

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: [
    tailwindcss({
      // Add the typography plugin here
      plugins: [typography()],
    }),
  ],
};

export default config;