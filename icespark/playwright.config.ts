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
      // dev 服务器上的全套用例（26 个 spec）：开发期跑得最快、迭代最舒服
      name: 'chromium',
      testIgnore: /production\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /**
       * **打包产物**项目：只有 `production.spec.ts` 一个 spec，跑在 `vite preview`（4175）上。
       *
       * 为什么必须单独有一道门：dev 服务器与打包产物是两套东西 ——
       * 路由的 SPA 回退、hash 文件名、按路由切分的懒加载 chunk、字体与静态资源的路径，
       * 全都只在产物里才成立。P1 收尾做过一次**人工**产物验证（架构 §14.6），
       * 之后两年（轮）没人再做过：dev 全绿不等于能上线。
       */
      name: 'preview',
      testMatch: /production\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4175' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
    },
    {
      /**
       * 产物服务：**命令里带构建**，所以它一定是刚构建出来的那一份
       * —— 复用旧服务（reuseExistingServer）会让这道门拿旧产物给出假 PASS，所以不复用；
       * 端口被占就直接失败，那本来也该先收拾现场。
       */
      command: 'npm run build && npx vite preview --port 4175 --strictPort',
      url: 'http://localhost:4175',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
