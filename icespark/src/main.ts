import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { ROOT_SELECTOR, mountScenePresenter } from '@/scene/presenter'

import '@/styles/base.css'

/**
 * 应用入口。
 *
 * 顺序有讲究：先装路由、再订阅转场表现层、最后挂载 ——
 * 这样「直接深链进来」的首次导航也走和站内跳转完全一样的转场路径。
 */
const app = createApp(App)
const router = createAppRouter()

app.use(router)

// 转场表现层只订阅路由（约定 3），不发起任何导航
mountScenePresenter(router, ROOT_SELECTOR)

app.mount(ROOT_SELECTOR)
