import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 转场场景名：scene/presenter.ts 把它写到外壳根节点的 data-scene 上，
     * CSS 据此决定进场方式（P2 补齐具体动画）。
     */
    scene?: string
    /** 页面名，P7 用于拼 document.title 与 JSON-LD */
    title?: string
    /**
     * 需要登录才能进（P5）。未登录深链接进来时：**回主页 + 外壳开登录框**，
     * 而不是在目标路径上渲染一个空壳 —— 用户裁定见架构 §23。
     */
    requiresAuth?: boolean
    /**
     * 需要超管（P5）。这条**不做重定向**：登录了但不是超管的人有权知道自己少了什么，
     * 于是页面自己渲染「仅超管可见」，路由照常进去（用户裁定见架构 §23）。
     * 未登录的情况由 `requiresAuth` 先拦下。
     */
    requiresSuperuser?: boolean
  }
}
