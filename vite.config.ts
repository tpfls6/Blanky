import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function packageEntry(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@blanky/types': packageEntry('./packages/types/src/index.ts'),
      '@blanky/utils': packageEntry('./packages/utils/src/index.ts'),
      '@blanky/api': packageEntry('./packages/api/src/index.ts'),
    },
  },
})
