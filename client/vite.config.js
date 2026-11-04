import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas /api vão para o servidor Express
    proxy: { '/api': 'http://localhost:3333' },
  },
})
