import { createRouter, createWebHistory } from 'vue-router'

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
