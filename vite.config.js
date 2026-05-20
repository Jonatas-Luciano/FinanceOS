import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',   // importante para o Electron carregar assets corretamente
  build: {
    outDir: 'dist'
  }
})