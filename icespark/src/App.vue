<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  markSoundPromptShown,
  motionEnabled,
  setSound,
  soundEnabled,
  soundPromptShown,
} from '@/config/prefs'
import { mountInput } from '@/input'
import { onPad } from '@/input/pad'
import { activeScope, focusZone, inputLocked, pageModalOpen, setScope } from '@/input/scopes'
import {
  applyDocumentMeta,
  composeTitle,
  pageTitleOverride,
} from '@/frame/documentMeta'
import { playSfx, previewSfx } from '@/input/sfx'
import BootScreen from '@/machine/BootScreen.vue'
import LoginDialog from '@/machine/LoginDialog.vue'
import PauseMenu from '@/machine/PauseMenu.vue'
import SoundPrompt from '@/machine/SoundPrompt.vue'
import TabBar from '@/machine/TabBar.vue'
import { booting } from '@/scene/boot'
import { canGoBack, canGoForward, goBack, goForward } from '@/scene/nav'
import { currentScene, sceneSeq } from '@/scene/presenter'
import { SCENES, sceneDef } from '@/scene/scenes'
import { screenScroller, scrollScreenTop } from '@/scene/screen'
import { blurTabs, cycleTab, onTabScene } from '@/scene/tabs'
import { isTransitioning, transitionKind, transitionSeq } from '@/scene/transition'
import { useAuthStore } from '@/stores/auth'
import { useAvatarStore } from '@/stores/avatars'
import { useShellStore } from '@/stores/shell'
import { useSiteStore } from '@/stores/site'
import { SCALE } from '@/styles/tokens'

/**
 * icespark 应用外壳 —— 结构、类名与样式**照搬样机** `design/icespark-prototype/src/App.vue`。
 *
 * 三段式，不要改动：
 *
 *   .app                    ← 外壳根节点（输入层挂它，不挂 window）
 *   ├── .screen             ← 唯一的画面：3px 像素外框 + CRT 质感
 *   │   ├── .screen-inner   ← 路由出口（滚动容器）
 *   │   ├── .trans          ← 整屏像素转场遮罩
 *   │   └── 模态层          ← 音效询问 / 日后暂停菜单
 *   └── .deck               ← 屏幕下沿：场景指示 · 软按键 · 数据源 · 必要小字
 *
 * 两条曾经走偏、现已定死的口径：
 *   1. **塑料机身外壳已移除，画面即屏幕**；底栏在**外框下方**（`.deck`），不是塞进框内。
 *   2. 站点小字（版权 · 口号 · 备案）并入 `.deck` 最右侧，与外壳绑定 ——
 *      外框在则它在，所有场景（含 404 与日后的开机自检）都在，各页面不许自己实现页脚。
 */

/** 开机瞬间的显像管亮线动画（640ms 后交给正常画面） */
const poweringOn = ref(true)

/** 外壳根节点：输入层挂在它上面 */
const root = ref<HTMLElement | null>(null)

/** 屏幕内层滚动容器：场景里滚正文要用（方向键不能靠全局劫持解决） */
const screenInner = ref<HTMLElement | null>(null)

/** 音效询问是否打开 */
const promptOpen = ref(false)

/**
 * 登录弹窗（外壳级模态）。
 *
 * P3 收尾按用户口径从「菜单里再叠一层」提上来：菜单里的「登录」行先把自己关掉，
 * 再由外壳开这个框（两个模态不叠）。登录成功后把菜单重新打开并带一句提示 ——
 * 用户回到菜单就能看到登录后才出现的那几行（编辑文章 / 个人信息编辑 / 站点设置…）。
 */
const loginOpen = ref(false)

/**
 * 登录框是**从哪儿进来的**（P5）。
 *
 * 两条来源的收尾动作不一样，所以必须记住：
 * - 菜单（`machine/PauseMenu.vue` 的「登录」行）→ 关掉 / 成功后**把菜单还回去**，
 *   用户本来就站在菜单上；
 * - 路由守卫（未登录深链接进需鉴权页）→ **不回菜单**，用户站在主页上。
 * 混成一条就会出现「关掉登录框，面前凭空多出一个暂停菜单」。
 */
const loginFromMenu = ref(true)

/** 登录框里那句提示（守卫给的「这个页面要先登录」）；从菜单进来时是空串 */
const loginNotice = ref('')

/** 给菜单的一次性提示（「登录成功」），菜单关掉时清空，避免下次打开还挂着 */
const menuNotice = ref('')

/** 暂停菜单是否打开（P / 底栏「菜单 (P)」软键） */
const pauseOpen = ref(false)

const route = useRoute()
const router = useRouter()
const site = useSiteStore()
const auth = useAuthStore()
const avatars = useAvatarStore()
const shell = useShellStore()

/**
 * 画面上的场景。
 *
 * 开机自检期间是 `boot` —— 底栏那一排场景指示因此会点亮 BOOT 那一格，与样机一致
 * （样机的 `frame` 初值就是 `{ id: 'boot' }`）。生产版开机不是路由，所以这里把
 * 「开机中」显式映射成 boot；自检播完 `booting` 置假，场景立刻跟随路由。
 */
const sceneId = computed(() => (booting.value ? 'boot' : currentScene.value))

/**
 * 「页面自己按路由参数装载」的场景：这些场景**不参与 `viewKey` 的参数部分**。
 *
 * P6 起只有写作页一个。它内部有一份 `watch(routeKey)`——换稿子时自己取详情填表单，
 * 还会在保存后把 URL 换成新 slug。若外壳再按 `:key` 重建它，就会：
 * 把分组 / 文稿列表 / 标签全部重拉一遍，并且刚写完的「已保存 12:34:56」
 * 在重建里被抹掉（`savedAt` 是组件内的状态）。换稿子仍然换 URL、仍然可分享，
 * 只是不再重建组件 —— 这正是它自己那份 watcher 存在的意义。
 *
 * 文章页（`/post/a` → `/post/b`）**必须**留在重建那一档：它只按参数加载一次正文。
 */
const SELF_LOADING_SCENES = ['write']

/**
 * 场景实例 key（与样机 `sceneKey = id:param` 同一口径）。
 *
 * 只有「换了一篇文章」才需要重建组件：列表换页 / 换筛选不重建（保住焦点与滚动位置），
 * 而 `/post/a` → `/post/b` 必须重建（页面按路由参数只加载一次正文）。
 * 用 route 的参数而不是 `sceneSeq`（那个每次导航都变，会把列表也一起重建）。
 */
const viewKey = computed(() =>
  SELF_LOADING_SCENES.includes(sceneId.value)
    ? sceneId.value
    : `${sceneId.value}:${route.params.key ?? ''}`,
)

/**
 * 屏幕阅读器用的一级标题（**视觉隐藏**，屏幕上不出现，不是视觉改动）。
 *
 * 为什么要补：axe 的 `page-has-heading-one` 要求每页有一个 `h1`，而样机里
 * 只有文章页（`<h1 class="doc-title">`）自带一个 —— 主页 / 列表 / 关联 / 关于
 * 的「页面名」在样机里是 `.head-title` 那个 span（机器铭牌），不是标题元素。
 * 补在**外壳层**而不是逐页改样机 DOM：页面结构保持与样机逐字一致，
 * 而这本就属于外壳的语义责任（和 `.screen-inner` 用 `<main>`、`.deck` 带
 * `role="contentinfo"` 同一类）。
 *
 * 文章页 / 404 / 用户档案 与 P5 的四张账号管理页都由页面自己给出 `h1`，这里让位 ——
 * 一页两个一级标题没有意义。
 */
const SELF_TITLED_SCENES = [
  'article',
  'error',
  'user',
  'profile',
  'admin-site',
  'admin-links',
  'admin-audit',
  // P6 写作页：页面自带可见的一级标题（「写作台」），外壳不再发隐藏 h1（否则同页两个 h1）
  'write',
]

/**
 * 浏览器标题：`页面名 · 站点名`（§56）。页面名默认取路由 `meta.title`，
 * 「打开才知道名字」的页面（文章 / 用户主页）用 `usePageTitle()` 覆盖；
 * 站点名与描述都来自三级合并后的配置 —— 这样后台改站名，标签页跟着变。
 */
const shellTitle = computed(
  () => pageTitleOverride() || ((route.meta.title as string | undefined) ?? ''),
)

const shellHeading = computed(() => {
  if (SELF_TITLED_SCENES.includes(sceneId.value)) return ''
  return sceneDef(sceneId.value)?.hint ?? site.config.site.name
})

watchEffect(() => {
  applyDocumentMeta(
    document,
    composeTitle(shellTitle.value, site.config.site.name),
    site.config.site.description,
  )
})

let bootTimer = 0
let detachInput: (() => void) | null = null

// 屏内容器交给 scene/screen.ts：场景里滚正文靠它，而不是让方向键被全局吞掉
watch(screenInner, (el) => {
  screenScroller.value = el
})

/**
 * 换页把屏幕滚回顶部。
 *
 * 滚动容器是同一个 DOM 节点（页面组件换掉、容器不换），不归零的话
 * 从长文返回列表会停在半空，看起来像「列表少了一半」。
 */
watch(viewKey, () => scrollScreenTop())

/** 离开有标签栏的页面时，把焦点收回内容区（否则没人接收按键） */
watch(onTabScene, (value) => {
  if (!value) blurTabs()
})

/**
 * 首次用户手势 → 询问音效。
 *
 * 为什么要等手势：浏览器要求音频必须由用户手势启动；而且一进站就出声是打扰。
 * 为什么用一次性监听而不是挂在输入层：输入层只认它认得的按键，
 * 而「第一次交互」可能是鼠标点空白处 —— 那也是手势，也该问。
 */
function askSoundOnce(): void {
  if (soundPromptShown.value || promptOpen.value) return
  markSoundPromptShown()
  promptOpen.value = true
}

function onFirstGesture(): void {
  askSoundOnce()
}

/** 关菜单（点继续 / ESC / 点击菜单外走的是同一条路）：顺手清掉一次性提示 */
function closeMenu(): void {
  pauseOpen.value = false
  menuNotice.value = ''
}

/** 菜单里点「登录」：菜单已经自己关了，这里只负责开登录框 */
function openLogin(): void {
  loginFromMenu.value = true
  loginNotice.value = ''
  loginOpen.value = true
}

/**
 * 登出后的收口（用户反馈）：登出前停在**需要权限的页面**上时，登出要把人送回主页。
 *
 * 为什么不能只改菜单那一处：登出确实只有菜单一个入口，但 `loadMe()` 撞到 401
 * （令牌过期）也会登出。那条路同样不该把人留在 `/profile` / `/admin/*` 上 ——
 * 否则地址栏写着 `/admin/site`、屏幕上却是「仅超管可见」的空壳，
 * URL 与画面互相矛盾，正是 P5「未登录深链接回主页」那条裁定要避免的东西。
 *
 * 挂在 `isLoggedIn` 由真变假这一刻，而不是挂在 `logout()` 里：`stores/auth.ts`
 * 不能 import router（`router/index.ts` 已经 import 了它，会绕成一个环）。
 */
watch(
  () => auth.isLoggedIn,
  (logged, wasLogged) => {
    if (!wasLogged || logged) return
    if (route.meta.requiresAuth) void router.push('/')
  },
)

/**
 * 守卫要登录框（P5）：未登录深链接进需鉴权页时被送到这里。
 *
 * 与菜单路径的差别只有两点：不回菜单、框里带一句提示。
 * 顺手关掉菜单 —— 屏幕上任何时刻只允许一个模态（沿用 P3 的规矩）。
 */
watch(
  () => shell.loginRequested,
  (requested) => {
    if (!requested) return
    pauseOpen.value = false
    loginFromMenu.value = false
    loginNotice.value = shell.loginNotice
    loginOpen.value = true
    // 一次性请求，消费掉 —— 否则用户手动关了框，下次按 P 又会凭空弹出来
    shell.clearLoginRequest()
  },
)

/** 登录成功：关登录框；从菜单进来的把菜单还回去（顺便带上那句提示） */
function onLoginOk(): void {
  loginOpen.value = false
  if (!loginFromMenu.value) return
  menuNotice.value = '登录成功'
  pauseOpen.value = true
}

/** 登录框关掉（✕ / ESC / 点框外）：从菜单进来的回菜单，守卫进来的就地结束 */
function closeLogin(): void {
  loginOpen.value = false
  loginNotice.value = ''
  if (!loginFromMenu.value) return
  menuNotice.value = ''
  pauseOpen.value = true
}

/** 软键：音效开关（鼠标路径；键盘路径是 Tab + ENTER） */
function toggleSound(): void {
  setSound(!soundEnabled.value)
  if (soundEnabled.value) previewSfx('confirm')
}

/** 软键：呼出暂停菜单（与 P 键同一条路径） */
function togglePause(): void {
  // 登录框开着时不叠菜单（与音效询问同一条规矩）
  if (promptOpen.value || loginOpen.value) return
  if (pauseOpen.value) closeMenu()
  else {
    pauseOpen.value = true
    playSfx('confirm')
  }
}

/**
 * 全局键（`any` 作用域，排在场景监听器之后收到事件）。
 *
 * `consumed` 是第二趟派发的产物：第一趟已经用掉这个键时必须放手，
 * 否则会出现「Esc 关掉菜单 → 全局监听立刻又打开菜单」这类双触发。
 * 这一段与样机 `App.vue` 的 `offGlobal` 逐条对齐（Tab 切标签页 / Esc 呼出菜单 / Q·E 前进后退）。
 */
const offGlobal = onPad((action, consumed) => {
  // 音效询问框开着时，整块键盘归它所有（它是 pause 作用域，正常情况已消费）
  if (promptOpen.value) return true

  /** 模态（暂停菜单 / 对话框 / **页面自己的确认框**）打开时，导航类全局键一律不生效 */
  const inModal = activeScope.value !== 'scene' || pauseOpen.value || pageModalOpen.value

  if (action === 'tabNext' || action === 'tabPrev') {
    if (consumed) return false
    if (inModal) return true
    // 没有标签栏的页面（文章详情）不参与标签页切换：把 Tab 还给浏览器
    // —— 浏览器原生 Tab 就是「按 DOM 顺序遍历可聚焦元素」，自动滚进视野、回车自动激活
    if (!onTabScene.value) return false
    cycleTab(action === 'tabNext' ? 1 : -1)
    return true
  }

  if (action === 'cancel') {
    if (consumed) return false
    if (inModal) return false
    // 注意：**不看焦点分区**。早先「焦点在标签栏上时 ESC 先退回内容区」是个例外，
    // 用户裁定「ESC 在每一页都能起菜单」之后取消 —— 同一个键的含义不该取决于焦点在哪。
    playSfx('confirm')
    pauseOpen.value = true
    return true
  }

  if (action === 'back' || action === 'forward') {
    if (consumed) return false
    if (inModal) return true
    if (action === 'back') {
      if (!canGoBack.value) return true
      goBack()
    } else {
      if (!canGoForward.value) return true
      goForward()
    }
    return true
  }

  return false
}, 'any')

/**
 * P 是全局键：任何场景下都能呼出暂停菜单（开合切换）。
 *
 * 菜单自己开着时由它（pause 作用域）先消费掉这个键来关闭，
 * 所以这里要看 `consumed` —— 否则会「关掉又立刻打开」。
 */
const offStart = onPad((action, consumed) => {
  if (consumed || action !== 'start') return false
  // 音效询问 / 登录框 / 页面自己的确认框开着时，P 不该再叠一个菜单上来（吞掉，不穿透）
  if (promptOpen.value || loginOpen.value || pageModalOpen.value) return true
  togglePause()
  return true
}, 'any')

/**
 * 模态作用域收口（外壳负责，P3 收尾新增）。
 *
 * 三个外壳级模态（音效询问 / 暂停菜单 / 登录框）各自在挂载时 `setScope('pause')`，
 * 但「一个卸载、另一个挂载」发生在同一次 patch 里：后者的挂载先跑、前者的还原闭包后跑，
 * 结果把新模态的作用域一起还原成 `scene`（实测：菜单 → 登录框时 `data-scope` 变 scene，
 * 按键穿透到背后场景，按 ESC 甚至会在登录框后面又开出一个菜单）。
 *
 * 修法不是去改四个模态组件，而是让外壳按「谁在台上」重新收口一次：
 * `flush: 'post'` 保证它跑在本次 patch（含卸载还原）之后。
 *
 * **P5 补的一味药：`viewKey` 也进观察名单。** 路由守卫那一条路（未登录深链接进需鉴权页
 * → 回主页 + 开登录框）里，收口的 `setScope('pause')` 之后还有一次**导航自带的**
 * `resetInputState()`（转场层在路由切换时必须调它，否则从开着菜单的页面跳走会卡在 pause），
 * 它把作用域又摁回 `scene` —— 实测：登录框挂在屏幕上、`data-scope` 却是 `scene`，
 * 于是框里的 ESC 根本收不到（按键先被全局那条 ESC 拿去开了暂停菜单）。
 * 把导航本身也纳入观察：**导航结束后再收口一次**，无论谁先谁后，最后一句都是对的。
 */
watch(
  [pauseOpen, promptOpen, loginOpen, viewKey],
  ([menu, prompt, login]) => {
    // 再等一个 tick 才写：模态组件的挂载/卸载**不是**同一时刻——实测「菜单 → 登录框」
    // 时登录框的 setup 先跑、post 队列随后、菜单的 onUnmounted 反而最后跑，
    // 它那句还原会把这边的收口再盖掉。等这一轮 patch 彻底结束再写，才是最后一句。
    void nextTick(() => setScope(menu || prompt || login ? 'pause' : 'scene'))
  },
  { flush: 'post' },
)

onMounted(() => {
  bootTimer = window.setTimeout(() => (poweringOn.value = false), SCALE.motion.boot)

  // 有缓存令牌时静默校验一次登录态（取样机 App.vue 的 bootstrapAuth()）：
  // token 过期就悄悄登出，网络抖动不动 token —— 判断在 store 里
  auth.bootstrapAuth()

  // icespark 自己那份点阵头像：公开接口，未登录也能显示别人的，所以与登录态无关。
  // 只拉一次（store 内部缓存）；这条路由在静态部署里不存在，拿不到就是「没有」。
  void avatars.load()

  if (root.value) detachInput = mountInput(root.value)

  // 一次性手势监听：两条路径（键盘 / 鼠标）都可能先发生
  root.value?.addEventListener('keydown', onFirstGesture)
  root.value?.addEventListener('pointerdown', onFirstGesture)
})

onUnmounted(() => {
  window.clearTimeout(bootTimer)
  offGlobal()
  offStart()
  detachInput?.()
  root.value?.removeEventListener('keydown', onFirstGesture)
  root.value?.removeEventListener('pointerdown', onFirstGesture)
})
</script>

<template>
  <div
    ref="root"
    class="app"
    tabindex="-1"
    :data-scene="sceneId"
    :data-scene-seq="sceneSeq"
    :data-motion="motionEnabled ? 'on' : 'off'"
    :data-scope="activeScope"
    :data-zone="focusZone"
    :data-locked="inputLocked"
  >
    <!-- 唯一的屏幕：crt 类挂载扫描线 / 荫罩 / 暗角三层质感 -->
    <div
      class="screen crt"
      :class="{ 'crt-on': poweringOn, 'crt-flicker': motionEnabled }"
      data-testid="screen"
    >
      <!-- 顶部标签栏：只在浏览类页面上出现，文章详情自带返回 -->
      <TabBar v-if="onTabScene" />

      <!-- 路由出口。用 <main> 而不是 <div>：屏幕内容需要一个地标，
           axe 的 region 规则会把「不在任何地标里的正文」判成违规（P3 起页面变多才暴露）。
           class 不变，样式与样机逐字一致 —— 换标签在视觉上是零影响。 -->
      <main ref="screenInner" class="screen-inner">
        <!-- 屏幕阅读器的一级标题：视觉隐藏，见 shellHeading 的说明 -->
        <h1 v-if="shellHeading" class="sr-heading">{{ shellHeading }}</h1>
        <!-- 开机自检：URL 已经是真实路由，这里只是「先播一段机器启动」，
             播完 booting 置假，画面换成当前路由那一页（深链接也照样先播） -->
        <BootScreen v-if="booting" />
        <RouterView v-else :key="viewKey" />
      </main>

      <!-- 场景转场遮罩：整屏像素切换。key 变了就重播一遍动画（见 scene/transition.ts） -->
      <div
        v-if="isTransitioning"
        :key="transitionSeq"
        class="trans"
        :class="`k-${transitionKind}`"
        data-testid="transition"
      />

      <!-- 暂停菜单（P / 底栏软键呼出） -->
      <PauseMenu v-if="pauseOpen" :notice="menuNotice" @close="closeMenu" @open-login="openLogin" />

      <!-- 登录弹窗：外壳级模态，与菜单互斥（不叠在一起） -->
      <LoginDialog v-if="loginOpen" :notice="loginNotice" @close="closeLogin" @ok="onLoginOk" />

      <!-- 音效首次询问：键鼠双路径的模态 -->
      <SoundPrompt v-if="promptOpen" @close="promptOpen = false" />
    </div>

    <!-- 屏幕下沿：软按键条。既是提示，也是可点的控件（鼠标路径） -->
    <!-- 语义上它就是站点页脚：给底栏一个 contentinfo 地标，屏幕阅读器能直达 -->
    <div class="deck px px-12" role="contentinfo" data-testid="deck">
      <span class="deck-scene" data-testid="deck-scene">
        <b v-for="s in SCENES" :key="s.id" :class="{ on: s.id === sceneId }">
          {{ s.id === sceneId ? s.label : '·' }}
        </b>
      </span>

      <!-- 站点小字（**永远在软键左侧**）：内容与顺序都来自 `footer.items`，
           空条目整段省略（不留下孤零零的 ` · `） -->
      <p class="deck-footer" data-testid="deck-footer">
        <template v-for="(segment, index) in site.footerParts" :key="segment.id">
          <span v-if="index > 0" class="deck-dot" aria-hidden="true">·</span>
          <!-- 条目逐字渲染（硬要求 3：只刻一行小字，不做页脚区块） -->
          <span class="deck-seg" data-deck-seg="item">{{ segment.text }}</span>
        </template>
      </p>

      <span class="deck-keys">
        <button class="softkey focusable mini" data-testid="softkey-menu" @click="togglePause">
          菜单 (P)
        </button>
        <button class="softkey focusable mini" data-testid="softkey-sound" @click="toggleSound">
          音效 {{ soundEnabled ? 'ON' : 'OFF' }}
        </button>
      </span>

      <span
        class="deck-src"
        :class="site.live ? 'live' : 'demo'"
        data-testid="deck-src"
        :title="site.sources.join(' / ')"
      >
        {{ site.live ? '● LIVE' : '○ DEMO' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ── 外壳 ── 以下到 .screen-inner 结束的规则与样机逐字一致 */
.app {
  height: 100vh;
  background: var(--paper-alt);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
  gap: 6px;
  overflow: hidden;
  /* 输入层的锚点：它自己要能接住按键（见 input/index.ts 的说明） */
  outline: none;
}

/* 屏幕：唯一的画布。纵向 flex 让内容区与遮罩各就各位 */
.screen {
  flex: 1;
  position: relative;
  border: var(--border-frame) solid var(--edge);
  background: var(--paper);
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 层级（**有意偏离样机**，§28.12）：样机这一份没有这一行，于是屏幕里的弹窗盖不住底栏软键。
     原因是两件事凑在一起 ——
       ① `.screen` 带 `isolation: isolate`（CRT 三层质感要它，见 crt.css），它因此是个**层叠上下文**，
          遮罩写在里面的 `z-index: 200/220/240` 全被关在这层里，跟外面的东西比不了大小；
       ② 底栏软键带 `.focusable` 的 `position: relative`（z-index auto），
          与 `.screen`（也是 z-index auto）同属「定位元素」那一层，**树序在后的赢** ——
          底栏在 `.screen` 之后，实测 `elementFromPoint` 命中的就是软键（看得见、点得到）。
     给屏幕一个正数 z-index：`.screen` 落到「正 z-index」那一层，整块画面（含所有模态）
     压在底栏之上。底栏是外框下方的机身按键，本就不该压住屏幕上的弹窗
     （§28.10 记的口径就是「遮罩盖住 .deck」，实现一直没做到）。底栏与屏幕不重叠，
     没有弹窗时外观与点击行为零影响。 */
  z-index: 1;
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
}

.screen-inner {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
}

.screen-inner > * {
  flex: 1 1 auto;
  min-height: 100%;
}

/*
 * 屏幕阅读器专用的一级标题：只看得到、看不见。
 * 必须真的在无障碍树里（`display:none` / `visibility:hidden` 会被一起藏掉，
 * axe 的 page-has-heading-one 也就看不到了），所以用 1px + 裁切的标准写法；
 * 同时抵消上面 `.screen-inner > *` 给直接子元素的 `min-height: 100%`。
 * 全部是盒模型属性，没有颜色 —— 配色门不受影响。
 */
.sr-heading {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  flex: 0 0 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ── 整屏转场遮罩（三种：闪白 / 竖条擦除 / 抖屏），动画时长与 transition.ts 的 MASK_MS 对齐 ── */
.trans {
  position: absolute;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}

.k-flash {
  background: var(--blue-200);
  animation: trans-flash var(--motion-turn) steps(1, end) 1;
}

@keyframes trans-flash {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.k-wipe {
  background: repeating-linear-gradient(90deg, var(--blue-400) 0 24px, transparent 24px 48px);
  animation: trans-wipe var(--motion-turn) steps(6, end) 1;
}

@keyframes trans-wipe {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.k-shake {
  background: var(--blue-300);
  animation: trans-shake var(--motion-turn) steps(2, end) 1;
}

@keyframes trans-shake {
  0%,
  100% {
    opacity: 0;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-8px);
  }
  70% {
    opacity: 1;
    transform: translateY(8px);
  }
}

/* ── 底部软按键条（样机定稿 + 用户口径：场景指示 | 站点小字 | 软键 | 数据源） ── */
.deck {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ink-soft);
  flex-wrap: wrap;
  padding: 0 2px;
}

.deck-scene {
  display: flex;
  gap: 8px;
  align-items: center;
}

.deck-scene b {
  font-weight: 400;
  color: var(--ink-faint);
}

.deck-scene b.on {
  color: var(--ink);
  background: var(--blue-200);
  padding: 0 4px;
}

.deck-keys {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.softkey {
  font: inherit;
  background: var(--paper);
  border: var(--border-thin) solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

.softkey:hover {
  background: var(--blue-100);
}

.deck-src.live {
  color: var(--blue-600);
}

/* 站点小字：右端这一组的开头 —— 于是它在软键**左侧**，一行，不与软键抢位置 */
.deck-footer {
  margin: 0 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.deck-dot {
  color: var(--ink-faint);
}

/* 窄屏不再按段丢字（条目是用户排的，内核不知道哪条能丢），整行交给省略号 */
</style>
