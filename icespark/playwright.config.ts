import { defineConfig, devices } from '@playwright/test'

/**
 * P0 的 e2e 配置。
 *
 * 只跑「骨架通不通」这类不依赖后端数据的用例；
 * 纯键盘 / 纯鼠标 parity、配色门、无障碍从 P1 / P2 起往 e2e/ 里加（架构 §4）。
 * 浏览器用 Playwright 内置 chromium（无需系统 Chrome）。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    // dev 端口 5175：5173 是样机，5174 被同机其他项目占用
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
  },
})
