import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由表。
 *
 * URL 是唯一真相来源：路径、查询参数都在这里定义，页面组件不得自己改 hash / history。
 * 列表状态（分组、标签、页码）走查询参数，例如 `?group=&tag=&page=`。
 *
 * P0 只有「首页 + 兜底」两条；P3 起按旧前端视图逐个补齐：
 * `/posts` · `/post/:slug` · `/about` · `/links` · `/search` · `/user/:username` · `/login` · `/profile` · `/write` · `/post/:slug/edit`
 * 全部懒加载（每个路由一个 chunk），阅读首屏不该背上别的页面的代码。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    // 场景名与样机一致：`/` 是 home。开机自检（boot）**不是一条路由** ——
    // 它播完就换成当前路由的场景，按后退不会退回自检画面（架构 §10）
    meta: { scene: 'home', title: '首页' },
  },
  {
    // 兜底：must be last —— 404 必须是路由表最后一条
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { scene: 'error', title: '页面不存在' },
  },
]
