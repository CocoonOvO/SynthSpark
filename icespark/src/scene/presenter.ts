import type { RouteLocationNormalized, Router } from 'vue-router'

/** 外壳根节点：转场层与（P2 的）输入层都挂在它上面，不挂 window */
export const ROOT_SELECTOR = '#app'

/** 场景名兜底：路由没写 meta.scene 时用它 */
const FALLBACK_SCENE = 'plain'

/**
 * 转场表现层（约定 3）。
 *
 * 样机里的 scene.ts 有 153 行，因为它同时管「现在在哪」和「怎么过去」；
 * 生产版把导航整件事交还给 vue-router，这里只剩一件事：
 * 把「现在在哪个场景」告诉 CSS —— 写到根节点的 data-scene 上。
 *
 * 它不发起导航、不读写 history、不碰 URL。要跳转请用 <RouterLink> 或 router.push。
 */
export function mountScenePresenter(router: Router, selector: string = ROOT_SELECTOR) {
  // 根节点在首次导航时可能还没挂载出来，所以每次找不到就重试，找到后缓存
  let root: HTMLElement | null = null

  // 递增序号：同一场景之间跳转也能触发 CSS 动画（attr 变了）
  let seq = 0

  function apply(to: RouteLocationNormalized) {
    root ??= document.querySelector<HTMLElement>(selector)
    if (!root) return

    seq += 1
    root.dataset.scene = to.meta.scene ?? FALLBACK_SCENE
    root.dataset.sceneSeq = String(seq)

    // 需要更细粒度反应的样式/插件可以监听这个事件（detail 里带 to 与序号）
    root.dispatchEvent(new CustomEvent('synthspark:scene', { detail: { to, seq } }))
  }

  // 首次导航（直接深链打开）也会走这条路径
  const stop = router.afterEach((to, _from, failure) => {
    if (!failure) apply(to)
  })

  // 兜底：路由还没解析完就被挂载的话，等首次导航落地再补一次
  void router.isReady().then(() => {
    if (root === null) apply(router.currentRoute.value)
  })

  return {
    /** 卸载订阅（目前只在测试里用得上） */
    dispose: stop,
  }
}
