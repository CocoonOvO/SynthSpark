import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    proxy: {
      // 样机直接打真实后端，验证接口契约
      '/api': { target: 'http://localhost:8002', changeOrigin: true },
    },
  },
})
