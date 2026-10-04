import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/pixel.css'
import { ROLES } from './styles/tokens'

/**
 * 把设计 token 注入 :root
 *
 * tokens.ts 是配色的**唯一来源**，CSS 只允许写 var(--xxx) 引用，不写具体色值。
 * 这一步以前漏掉了（220 处 var() 引用、0 处定义），后果不是「颜色有点偏」，
 * 而是：var() 取不到值时整条声明按「计算值无效」处理 ——
 * 背景变透明、border 简写被整个重置成 none，全站边框直接消失、
 * 只剩白底黑字。所以这里必须注入，并由 e2e 的配色门守卫（e2e/parity.mjs）。
 */
for (const [name, value] of Object.entries(ROLES)) {
  document.documentElement.style.setProperty(name, value)
}

createApp(App)
  // 路由必须在挂载前装上：App 的场景帧要靠它解析出来（含深链接）
  .use(router)
  .mount('#app')
