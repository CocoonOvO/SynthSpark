import { createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'

import { routes } from './routes'

import './types'

/**
 * 建路由实例。
 *
 * 用 history 模式（真 URL）而不是 hash：皮肤式的硬要求 —— 深链接、后退键、SEO 都要真的能用。
 * 代价写在这里：**部署端必须把未知路径回退到 index.html**，否则刷新子路径会 404。
 * 仓库不含部署配置（AGENTS.md 第 9 节），这条要求见 design/icespark-ARCHITECTURE.md §8。
 */
export function createAppRouter() {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior(to, _from, savedPosition) {
      // 后退/前进回到原位置，其余情况回顶；带锚点时交给浏览器
      if (savedPosition) return savedPosition
      if (to.hash) return { el: to.hash }
      return { top: 0 }
    },
  })
}

/**
 * 应用唯一的 router 实例（惰性单例）。
 *
 * 为什么要有这个函数：导航动作层（`scene/nav.ts`）与标签栏状态（`scene/tabs.ts`）是
 * **模块级**代码 —— 它们的 `computed` 和事件回调不在任何组件 setup 上下文里，
 * `useRouter()`（本质是 inject）在那里拿不到实例。样机是靠 `export const router`
 * 这个模块级常量解决的，生产版保持同样的「一处实例」口径，只是改成用到时才建，
 * 免得 `import` 一个模块就顺手把 history 也建了。
 *
 * 谁都必须用它拿到实例（`main.ts` 也一样）—— 两条 history 是两个世界，
 * 分开建会出现「URL 变了但画面不动」这种最难查的 bug。
 */
let instance: Router | null = null

export function appRouter(): Router {
  return (instance ??= createAppRouter())
}
