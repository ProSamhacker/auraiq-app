import tailwindcss from "@tailwindcss/postcss";
import typography from "@tailwindcss/typography";

const config = {
  plugins: [
    tailwindcss({
      // This is where you can add your tailwind.config.ts path if needed
      // config: './tailwind.config.ts', 
      
      // Add the typography plugin here
      plugins: [typography()],
    }),
  ],
};

export default config;