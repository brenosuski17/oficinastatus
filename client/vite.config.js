import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento, /api e /uploads vão para o servidor Express
    proxy: { '/api': 'http://localhost:3333', '/uploads': 'http://localhost:3333' },
  },
})
