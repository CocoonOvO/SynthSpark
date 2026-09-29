import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * 单测配置（独立于 vite.config.ts）：构建期插件不该跑进测试环境。
 *
 * environment 用 node：现在测的是配置合并这类纯逻辑。
 * 将来要测组件（P2 的输入层、F 层控件）再换 jsdom。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
