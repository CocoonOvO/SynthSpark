import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * icespark 独立前端的构建配置。
 *
 * 三件事：
 *  1. `@` 别名 → src（与 tsconfig.app.json 的 paths 对齐）
 *  2. `/api` 代理 → 后端 8002（生产由部署方同源反代，代码里始终只写 `/api`）
 *  3. history 模式的路由意味着**部署端必须把未知路径回退到 index.html**
 *     （SPA fallback），否则刷新 `/post/xxx` 会 404。见 design/icespark-ARCHITECTURE.md §8。
 *
 * P1 接入：tokens.ts → tokens.generated.css（构建期生成静态 CSS），届时在这里加一个
 * `buildStart` 阶段的小插件，避免运行期注入（旧前端漏过一次，220 处 var() 没定义）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 后端地址：默认 8002（与 AGENTS.md 第 3 节一致）
  const apiTarget = env.VITE_API_URL || 'http://localhost:8002'

  return {
    plugins: [vue()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      // 5173 是样机、5174 被同机其他项目占用，icespark 固定在 5175
      port: 5175,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },

    preview: {
      port: 4175,
    },
  }
})
