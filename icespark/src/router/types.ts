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
  }
}
