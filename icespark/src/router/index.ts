import { createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'

import { routes } from './routes'

import { useAuthStore } from '@/stores/auth'
import { useShellStore } from '@/stores/shell'

import './types'

/**
 * 建路由实例。
 *
 * 用 history 模式（真 URL）而不是 hash：皮肤式的硬要求 —— 深链接、后退键、SEO 都要真的能用。
 * 代价写在这里：**部署端必须把未知路径回退到 index.html**，否则刷新子路径会 404。
 * 仓库不含部署配置（AGENTS.md 第 9 节），这条要求见 design/icespark-ARCHITECTURE.md §8。
 */
export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior(to, _from, savedPosition) {
      // 后退/前进回到原位置，其余情况回顶；带锚点时交给浏览器
      if (savedPosition) return savedPosition
      if (to.hash) return { el: to.hash }
      return { top: 0 }
    },
  })

  installGuards(router)
  return router
}

/**
 * 鉴权守卫（P5，口径见架构 §23）。
 *
 * 只有 templateUrl「未登录」这一条会**重定向**：回主页，并请外壳弹登录框（附提示）。
 * 为什么不留在目标路径上渲染一个「请先登录」的空壳：那会让 URL 与画面互相矛盾
 * （地址栏写着 `/admin/site`，屏幕上却没有站点设置），而用户裁定的是「回主页 + 弹框」。
 *
 * `requiresSuperuser` **不重定向**：登录了但不是超管的人有权知道这里少了什么，
 * 于是路由照常进去、由**页面自己**渲染「仅超管可见」（每张超管页都有这条）。
 * 未登录的情况已经被 `requiresAuth` 先拦下 —— 这两条 meta 需要一起写。
 *
 * 守卫里能用 `useAuthStore()` 的原因：`main.ts` 先 `app.use(pinia)` 再 `app.use(router)`，
 * 首次导航发生时 pinia 已经是活动实例。
 */
function installGuards(router: Router): void {
  router.beforeEach((to) => {
    if (!to.meta.requiresAuth) return true

    const auth = useAuthStore()
    if (auth.isLoggedIn) return true

    // 目标路径不进 URL：提示与意图都通过外壳请求传递，一次性消费
    useShellStore().requestLogin('这个页面要先登录')
    return { path: '/', replace: true }
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
