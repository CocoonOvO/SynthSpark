import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 外壳请求（P5）。
 *
 * 为什么要有这个小 store：**路由守卫不是组件**，它没法 `emit('open-login')`；
 * 而「未登录访问需鉴权页 → 回主页 + 外壳弹登录框（附一句提示）」这条用户裁定的口径
 * 需要有人在守卫与外壳之间传话。三条路子里选它：
 *
 * 1. 守卫里直接操作 DOM / 直接改 `App.vue` 的 ref —— 拿不到；
 * 2. 走查询参数（`/?login=1`）—— 会在 URL 里留一个「一次性」状态，
 *    刷新一次还会再弹一次，而且用户按后退又弹一次；
 * 3. 一个模块级 store，外壳 watch 它 —— 一次性、不进 URL、两边都不需要知道对方的存在。
 *
 * 口径与 `machine/PauseMenu.vue` 的「点登录行」完全一致：外壳只负责开框，
 * **提示**由请求方给（点菜单是「登录成功」那种由外壳自己产生的提示，这里由守卫给）。
 */
export const useShellStore = defineStore('shell', () => {
  /** 外壳是否被要求开登录框 */
  const loginRequested = ref(false)

  /** 开框时顺带显示的一句提示（守卫给的：「这个页面要先登录」） */
  const loginNotice = ref('')

  /** 请求外壳开登录框（`notice` 会显示在框里，空串表示不提示） */
  function requestLogin(notice = ''): void {
    loginNotice.value = notice
    loginRequested.value = true
  }

  /**
   * 外壳处理完就清掉。
   *
   * **必须清**：不清的话用户手动关掉登录框、过一会儿自己按 P 打菜单时，
   * 这个请求还挂着，外壳会在他没要求的时候又弹一次框。
   */
  function clearLoginRequest(): void {
    loginRequested.value = false
    loginNotice.value = ''
  }

  return { loginRequested, loginNotice, requestLogin, clearLoginRequest }
})
