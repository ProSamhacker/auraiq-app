import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  // This tells Tailwind where your class names are being used
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  // Your other Tailwind settings would go here (e.g., theme)

  plugins: [
    typography(), // Add the typography plugin here
  ],
}
export default config