import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

import { createAvatarRoute } from './avatar-route'

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

/**
 * icespark 自己的点阵头像路由（架构 §67）。
 *
 * **它挂的是 `/avatar`，不是 `/api/avatar`** —— `/api` 已经被代理整条打给后端了，
 * 这条路由属于前端自己，混进去既容易被代理吞掉，也说不清归属。
 *
 * 只在 dev 与 preview 服务器里存在：部署若只是「nginx 发 dist + 反代 /api」，
 * 这条路由就没有了，前端会退到「后端头像 → 名字回退」（`stores/avatars.ts` 里
 * 拿不到就永久标记 unavailable）。这一点在架构 §67 里写明了。
 */
function icesparkAvatarRoute(apiTarget: string): Plugin {
  // 存储落在 icespark/avatars.local.json：本地文件、已 gitignore、可手改
  const file = fileURLToPath(new URL('./avatars.local.json', import.meta.url))
  const middleware = createAvatarRoute({ file, apiTarget })

  return {
    name: 'icespark-avatar-route',

    // 直接 use（而不是 return 一个函数）：Vite 的 configureServer 先于内置中间件执行，
    // 而内置的 SPA 回退会把不认识的路径换成 index.html —— 顺序反了，这条路由就永远轮不到。
    configureServer(server) {
      server.middlewares.use(middleware)
    },

    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 后端地址：默认 8002（与 AGENTS.md 第 3 节一致）
  const apiTarget = env.VITE_API_URL || 'http://localhost:8002'

  return {
    plugins: [vue(), icesparkAssets(), icesparkAvatarRoute(apiTarget)],

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
