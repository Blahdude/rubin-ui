import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // This is the key fix - use relative paths
  build: {
    outDir: 'dist'
  }
}) 