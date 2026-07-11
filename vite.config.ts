import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: command === 'serve' ? {
    https: {
      cert: readFileSync('.cert/localhost.pem'),
      key: readFileSync('.cert/localhost.key'),
    },
    proxy: {
      '/auth/google': 'http://localhost:3000',
      '/auth/me': 'http://localhost:3000',
      '/auth/refresh': 'http://localhost:3000',
      '/auth/users': 'http://localhost:3000',
      '/sessions': 'http://localhost:3000',
      '/poses': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  } : undefined,
}))
