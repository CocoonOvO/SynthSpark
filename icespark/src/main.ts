import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { ROOT_SELECTOR, mountScenePresenter } from '@/scene/presenter'
import { useSiteStore } from '@/stores/site'
import { ACTIVE_PALETTE } from '@/styles/tokens'

// 样式顺序即层叠顺序：token 变量 → 基础皮肤 → CRT 质感
import '@/styles/tokens.generated.css'
import '@/styles/pixel.css'
import '@/styles/crt.css'

/**
 * 应用入口。
 *
 * 顺序有讲究：先装 pinia / 路由、再订阅转场表现层、最后挂载 ——
 * 这样「直接深链进来」的首次导航也走和站内跳转完全一样的转场路径。
 */
const app = createApp(App)
const router = createAppRouter()
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 配色方案写到根节点：生成物按 [data-theme] 分组输出，
// 将来加主题只是换这个值（现在只有一套，见 styles/tokens.ts）
document.documentElement.dataset.theme = ACTIVE_PALETTE

// 转场表现层只订阅路由（约定 3），不发起任何导航
mountScenePresenter(router, ROOT_SELECTOR)

app.mount(ROOT_SELECTOR)

// 站点配置（三级合并）：不阻塞首屏 —— 先按内置默认渲染，拉到覆盖配置后自动更新
void useSiteStore(pinia).load()
