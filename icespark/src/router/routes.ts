import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由表。
 *
 * URL 是唯一真相来源：路径、查询参数都在这里定义，页面组件不得自己改 hash / history。
 * 列表状态（分组、标签、页码）走查询参数，例如 `?group=&tag=&page=`。
 *
 * 路由名与标签页 id **必须一致**（`scene/tabs.ts` 按路由名点亮标签栏），路径与样机一致
 * （`/posts` · `/post/:key` · `/links` · `/about`），便于深链接与旧前端对照。
 * 全部懒加载（每个路由一个 chunk），阅读首屏不该背上别的页面的代码。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { scene: 'home', title: '首页' },
  },
  {
    path: '/posts',
    name: 'posts',
    component: () => import('@/views/PostListView.vue'),
    meta: { scene: 'posts', title: '文章' },
  },
  {
    // key 优先是 slug（可读可分享），没有 slug 才落回 id —— 见 api/format.ts 的 postKey
    path: '/post/:key',
    name: 'article',
    component: () => import('@/views/PostDetailView.vue'),
    meta: { scene: 'article', title: '文章详情' },
  },
  {
    path: '/links',
    name: 'links',
    component: () => import('@/views/LinksView.vue'),
    meta: { scene: 'links', title: '关联' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { scene: 'about', title: '关于' },
  },
  {
    // 用户档案（P4）：旧前端 `frontend/src/views/user/UserProfileView.vue` 的那一页。
    // 用户名走**路径参数**（`/user/:username`），因此深链接可以直接打开某个用户的主页。
    // 路由名 / 场景 id / 标签页 id 三处同名（`user`），但它**不是**标签页
    // （`scene/tabs.ts` 的 TABS 里没有它）：这一页没有标签栏，`activeTab` 为空是正确行为。
    path: '/user/:username',
    name: 'user',
    component: () => import('@/views/UserProfileView.vue'),
    meta: { scene: 'user', title: '用户主页' },
  },
  {
    // 兜底：must be last —— 404 必须是路由表最后一条
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { scene: 'error', title: '页面不存在' },
  },
]
