import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * icespark 独立前端的构建配置。
 *
 * 四件事：
 *  1. `@` 别名 → src（与 tsconfig.app.json 的 paths 对齐）
 *  2. `/api` 代理 → 后端 8002（生产由部署方同源反代，代码里始终只写 `/api`）
 *  3. **构建期生成 token CSS**：tokens.ts → tokens.generated.css。
 *     旧前端在运行期注入过一次，漏了就是 220 处 `var()` 没有定义、全站边框消失；
 *     静态生成让「定义」与「引用」永远同时存在。
 *  4. history 模式的路由意味着**部署端必须把未知路径回退到 index.html**（SPA fallback），
 *     否则刷新 `/post/xxx` 会 404。见 design/icespark-ARCHITECTURE.md §8。
 */
function icesparkAssets() {
  const scripts = fileURLToPath(new URL('./scripts', import.meta.url))

  // 直接调脚本本体，而不是在这里复制一份逻辑：
  // CI 校验用的就是同一条代码路径，不存在「本地能跑、门里不认」的可能。
  // --quiet：dev 每次启动都刷两行「已是最新」很吵，只在真的生成/复制时才说话。
  const run = (name: string) => {
    execFileSync(process.execPath, [`${scripts}/${name}`, '--quiet'], { stdio: 'inherit' })
  }

  // dev 下 configureServer 与 buildStart 都会触发，备料只做一次
  let prepared = false
  const prepare = () => {
    if (prepared) return
    prepared = true
    run('gen-tokens-css.mjs')
    run('ensure-font.mjs')
    run('ensure-site-config.mjs')
  }

  return {
    name: 'icespark-assets',

    // dev：起服务前备好 token CSS 与字体
    configureServer() {
      prepare()
    },

    // build：在模块加载前生成（dist 拷贝 public 之前）
    buildStart() {
      prepare()
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 后端地址：默认 8002（与 AGENTS.md 第 3 节一致）
  const apiTarget = env.VITE_API_URL || 'http://localhost:8002'

  return {
    plugins: [vue(), icesparkAssets()],

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
      // 与 `server.proxy` 同一份：部署时 `/api` 由反向代理分流（AGENTS.md 第 9 节），
      // 本地 `npm run preview` 要验证**打包产物**就得让它也能打到真后端 ——
      // e2e 的 `preview` 项目（`e2e/production.spec.ts`）跑的就是这个服务。
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
