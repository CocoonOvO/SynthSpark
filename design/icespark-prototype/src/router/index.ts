/**
 * 路由
 *
 * 用户要求第 8 条：URL 必须能直接进入对应页面（可分享、可收藏、可后退）。
 *
 * 分工（关键设计，别改成 RouterView）：
 * - **路由负责 URL 与历史**：解析路径/参数/查询，push/back/forward
 * - **ui/scene.ts 负责画面**：把「当前路由」翻译成一个 SceneFrame，并做整屏像素转场
 * 之所以不用 `<RouterView>`：像素转场要求「遮罩先出现，内容再换」，
 * 而 RouterView 会在导航的同一帧就把组件换掉，遮罩还没来得及盖上。
 * 所以这里的 routing 是「URL 与历史权威」，渲染仍然走自研的 presenter。
 *
 * 路径与旧前端保持一致（/posts、/post/:key、/links、/about），
 * 便于将来做分流与深链接对照。
 */
import { createRouter, createWebHistory, type RouteLocationNormalizedLoaded } from 'vue-router'
import { TAB_IDS } from '../ui/tabs'
import { present, setRouteResolver, setRouteGetter, booting } from '../ui/scene'
import { consumeTransition, syncHistoryFlags } from '../ui/nav'

/** 这个路由表只用来解析 URL：真正的画面由 scene.ts 的 presenter 渲染 */
const Blank = { render: () => null }

export const routes = [
  { path: '/', name: 'home', component: Blank },
  { path: '/posts', name: 'posts', component: Blank },
  { path: '/post/:key', name: 'article', component: Blank },
  { path: '/links', name: 'links', component: Blank },
  { path: '/about', name: 'about', component: Blank },
  // 未知路径回主页：样机不做 404 页，但**不能**白屏
  { path: '/:pathMatch(.*)*', name: 'not-found', redirect: { name: 'home' } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => false, // 屏内滚动由屏内容器自己管，别让浏览器动 document
})

/**
 * 把「路由 → 场景帧」的解析函数交给 scene.ts，开机动画播完后它自己来取。
 * 注意传的是 currentFrame —— 别传 resolveRouteFrame（那是 scene.ts 自己的入口，
 * 传进去会自我递归，直接爆栈）。
 */
setRouteResolver(currentFrame)

/**
 * 深链接支持：开机动画播完时，BootScene 会问「现在地址栏是哪一页」。
 * 用 getter 而不是值，是为了让 router 始终是唯一事实来源。
 */
setRouteGetter(() => router.currentRoute.value)

function currentFrame(r: RouteLocationNormalizedLoaded) {
  const name = String(r.name ?? '')
  if (name === 'article') return { id: 'article', param: String(r.params.key ?? '') }
  if (TAB_IDS.includes(name)) return { id: name }
  return { id: 'home' }
}

router.afterEach((to) => {
  syncHistoryFlags()
  // 开机动画还没播完：只更新 URL，画面留给 BootScene 播完后再切
  if (booting.value) return
  const f = currentFrame(to)
  present(f.id, f.param, consumeTransition())
})

export { currentFrame }
