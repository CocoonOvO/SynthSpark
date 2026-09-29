/**
 * 场景表 —— 样机 `styles/tokens.ts` 里的 `SCENES` 原样搬过来。
 *
 * 它是**画面层**的概念，不是路由：路由负责 URL，场景负责「屏幕上正在演哪一出」。
 * `boot`（开机自检）尤其不是一条路由 —— 它播完就换成当前路由对应的场景，
 * 所以按后退不会退回自检画面（样机的这条时序，架构 §10 已记）。
 *
 * 标签（BOOT / HOME / …）是 8bit 外壳的机器字样，和 `菜单 (P)` 同一类，
 * 属于皮肤而不是站点文案 —— 站点文案（导航、页脚、首页、关于）走三级配置。
 */
export interface SceneDef {
  /** 场景 id：与路由 `meta.scene` 的取值一致 */
  id: string
  /** 底栏场景指示上的机器字样 */
  label: string
  /** 中文含义（给提示与后续标签栏用） */
  hint: string
}

export const SCENES: SceneDef[] = [
  { id: 'boot', label: 'BOOT', hint: '开机' },
  { id: 'home', label: 'HOME', hint: '主页' },
  { id: 'posts', label: 'POSTS', hint: '文章列表' },
  { id: 'links', label: 'LINKS', hint: '关联链接' },
  { id: 'about', label: 'ABOUT', hint: '关于' },
  { id: 'article', label: 'ARTICLE', hint: '文章详情' },
  // P4 用户档案页（`/user/:username`）。标签 USER 是 8bit 机器字样（皮肤），
  // 底栏场景指示点亮的那一格显示的就是它；hint 顺带是外壳隐藏 h1 的兜底文案。
  { id: 'user', label: 'USER', hint: '用户主页' },
]

/** 取场景定义；不在表里（例如 404 的 `error`）返回 null —— 底栏不显示高亮，不编一个新场景 */
export function sceneDef(id: string): SceneDef | null {
  return SCENES.find((scene) => scene.id === id) ?? null
}
