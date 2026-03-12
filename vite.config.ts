import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth/google': 'http://localhost:3000',
      '/auth/me': 'http://localhost:3000',
      '/auth/refresh': 'http://localhost:3000',
      '/auth/users': 'http://localhost:3000',
      '/sessions': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    }
  }
})
