import { ref } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

import { resetInputState } from '@/input/scopes'
import { applyTransition, beginTransition, cancelTransition, consumeTransition } from './transition'

/** 挂载点选择器（`index.html` 里的容器）。外壳根节点 `.app` 由 App.vue 渲染，它是容器的子节点 */
export const ROOT_SELECTOR = '#app'

/** 场景名兜底：路由没写 meta.scene 时用它 */
const FALLBACK_SCENE = 'plain'

/** 当前场景 id（响应式）：外壳按它渲染 `data-scene`，底栏按它点亮场景指示 */
export const currentScene = ref<string>(FALLBACK_SCENE)

/** 递增序号：同一场景之间跳转也会变，CSS 动画与断言据此认出「又走了一次」 */
export const sceneSeq = ref(0)

/**
 * 转场表现层与输入层的接线处（约定 3）。
 *
 * 样机里的 scene.ts 有 184 行，因为它同时管「现在在哪」「怎么过去」和「什么时候换画面」；
 * 生产版把导航与画面都交还给 vue-router，这里只剩三件事：
 *
 * 1. 记住「现在在哪个场景」（响应式 ref，外壳自己绑到 `data-scene` 上）；
 * 2. 换页等于换交互现场 —— 重置按键作用域 / 焦点带 / 输入锁（P2）；
 * 3. 整屏像素转场 —— 遮罩在 `beforeEach` 出现、`afterEach` 收尾（P2，见 transition.ts）。
 *
 * 它不发起导航、不读写 history、不碰 URL。要跳转请用 <RouterLink> 或 router.push。
 *
 * 为什么不再由这里 `document.querySelector` 去写 `data-scene`：
 * P0 时表现层把属性写在挂载点 `#app` 上，而外壳的状态属性（`data-scope` 等）在 `.app` 上，
 * 于是同一个外壳被拆成两个节点、两处真值。现在真值只有一处（这个 ref），
 * 由渲染它的组件写属性 —— 顺带也没有了「首次导航早于挂载、取不到节点」的时序隐患。
 */
export function mountScenePresenter(router: Router) {
  // 首次导航不做转场：那一次页面还在开机亮线里，套一层遮罩反而像卡了一下
  let primed = false

  function apply(to: RouteLocationNormalized) {
    currentScene.value = to.meta.scene ?? FALLBACK_SCENE
    sceneSeq.value += 1

    // 换页等于换交互现场：把按键作用域、焦点带、锁定状态退回默认值，
    // 顺手解掉转场对输入的锁定 —— 内容已经换好，用户马上就能操作。
    // 放在这里而不是各页面 onUnmounted，是为了让「页面自己都忘了收尾」也不会串味；
    // 新页面的组件在本次 afterEach 之后才 setup，所以它设的作用域不会被这里吃掉。
    resetInputState()
  }

  // 导航一开始就把遮罩盖上：懒加载 chunk 的那段等待因此有反馈
  const stopBefore = router.beforeEach((to) => {
    if (!primed) return
    const scene = String(to.meta.scene ?? FALLBACK_SCENE)
    beginTransition(consumeTransition(), `${scene}:${to.fullPath}`)
  })

  const stopAfter = router.afterEach((to, _from, failure) => {
    if (failure) {
      // 守卫拦下或导航报错：画面没换，遮罩必须撤掉
      cancelTransition()
      return
    }

    apply(to)

    if (primed) applyTransition()
    primed = true
  })

  return {
    /** 卸载订阅（目前只在测试里用得上） */
    dispose: () => {
      stopBefore()
      stopAfter()
    },
  }
}
