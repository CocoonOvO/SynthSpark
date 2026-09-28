<script setup lang="ts">
/**
 * icespark 应用外壳
 *
 * 职责：
 * - 场景渲染 + 整屏像素转场（URL 与历史归 router，画面归 ui/scene.ts）
 * - 8bit 显像管质感（扫描线 / 荧光点阵 / 暗角 / 辉光 / 开机亮线）
 * - 顶部标签栏（浏览类页面的全局导航）
 * - P / ESC 键菜单（全局导航 + 设置入口）
 * - 全局键：Tab·Shift+Tab 切标签页、Q·E 历史后退/前进
 * - 音效首次询问
 *
 * 注：塑料机身外壳已移除，画面即屏幕；CRT 强度固定为最高档，用户不再可调。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  isTransitioning,
  transitionKind,
  frame as currentScene,
  sceneKey,
  screenScroller,
  scrollScreenTop,
  booting,
} from './ui/scene'
import { SCENES } from './styles/tokens'
import { soundEnabled, setSound, soundPromptShown, markSoundPromptShown, motionEnabled } from './ui/prefs'
import { playSfx, previewSfx } from './ui/sfx'
import { onPad, activeScope, inputLocked, focusZone } from './ui/pad'
import { cycleTab, onTabScene, blurTabs } from './ui/tabs'
import { goBack, goForward, canGoBack, canGoForward } from './ui/nav'
import { bootstrapAuth } from './ui/auth'
import { loadSiteConfig, loadStats, dataSource } from './data/api'
import PauseMenu from './ui/PauseMenu.vue'
import TabBar from './ui/TabBar.vue'
import BootScene from './scenes/BootScene.vue'
import HomeScene from './scenes/HomeScene.vue'
import ArticleListScene from './scenes/ArticleListScene.vue'
import LinksScene from './scenes/LinksScene.vue'
import AboutScene from './scenes/AboutScene.vue'
import ArticleScene from './scenes/ArticleScene.vue'

/** 开机瞬间的显像管亮线动画 */
const poweringOn = ref(true)
/** 屏幕内层滚动容器：场景里滚正文要用（方向键不能靠全局劫持解决） */
const screenInner = ref<HTMLElement | null>(null)
watch(screenInner, (el) => {
  screenScroller.value = el
})
const pauseOpen = ref(false)
const promptOpen = ref(false)
/** 音效询问里的焦点：0 = 开启，1 = 保持静音 */
const promptFocus = ref(0)

const SCENE_MAP: Record<string, unknown> = {
  boot: BootScene,
  home: HomeScene,
  posts: ArticleListScene,
  links: LinksScene,
  about: AboutScene,
  article: ArticleScene,
}

const frame = computed(() => currentScene.value)
const currentComponent = computed(() => SCENE_MAP[frame.value.id] || HomeScene)

/**
 * 换页时把屏幕滚回顶部。
 *
 * 滚动容器是同一个 DOM 节点（场景组件换掉、容器不换），
 * 不显式归零的话，从长文返回列表会停在半空，看起来像「列表少了一半」。
 */
watch(
  () => `${frame.value.id}:${frame.value.param ?? ''}`,
  () => scrollScreenTop()
)

/** 离开有标签栏的页面时，把焦点收回内容区（否则没人接收按键） */
watch(onTabScene, (v) => {
  if (!v) blurTabs()
})

/**
 * 全局键（any 作用域，排在场景监听器之后收到事件）
 *
 * `consumed` 是第二趟派发的产物：第一趟已经用掉这个键时必须放手，
 * 否则会出现「Esc 关掉菜单 → 全局监听立刻又打开菜单」这类双触发。
 */
const offGlobal = onPad((a, consumed) => {
  // 已提示过音效询问时，整键盘归询问框所有（它是 pause 作用域，正常情况已消费）
  if (promptOpen.value) return true

  /** 模态（暂停菜单 / 对话框）打开时，导航类全局键一律不生效 */
  const inModal = activeScope.value !== 'scene' || pauseOpen.value

  if (a === 'tabNext' || a === 'tabPrev') {
    if (consumed) return false
    if (inModal) return true
    // 没有标签栏的页面（文章详情）不参与标签页切换：手动按下 Tab 也不该跳页
    if (!onTabScene.value) return true
    cycleTab(a === 'tabNext' ? 1 : -1)
    return true
  }

  if (a === 'cancel') {
    if (consumed) return false
    if (inModal) return false
    // 焦点停在标签栏上时，ESC 先退回内容区，再按一次才呼出菜单
    if (focusZone.value === 'tabs') return false
    playSfx('confirm')
    pauseOpen.value = true
    return true
  }

  if (a === 'back' || a === 'forward') {
    if (consumed) return false
    if (inModal) return true
    if (a === 'back') {
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

/** P 是全局键：任何场景下都能呼出暂停菜单 */
const offStart = onPad((a) => {
  if (a !== 'start') return false
  if (promptOpen.value) return true
  pauseOpen.value = !pauseOpen.value
  if (pauseOpen.value) playSfx('confirm')
  return true
}, 'any')

/** 音效首次询问：键盘路径 */
const offPrompt = onPad((a) => {
  if (!promptOpen.value) return false
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    promptFocus.value = promptFocus.value === 0 ? 1 : 0
    playSfx('move')
    return true
  }
  if (a === 'confirm') {
    choosePrompt(promptFocus.value === 0)
    return true
  }
  if (a === 'cancel') {
    choosePrompt(false)
    return true
  }
  return false
}, 'pause')

/** 首次用户交互 → 询问音效（避免打扰，且必须有手势才能启动音频） */
function askSoundOnce() {
  if (soundPromptShown.value || promptOpen.value || pauseOpen.value) return
  markSoundPromptShown()
  promptOpen.value = true
  activeScope.value = 'pause'
}

function choosePrompt(enable: boolean) {
  setSound(enable)
  promptOpen.value = false
  activeScope.value = 'scene'
  if (enable) previewSfx('confirm')
}

function onFirstGesture() {
  askSoundOnce()
}

onMounted(() => {
  loadSiteConfig()
  loadStats()
  bootstrapAuth()
  window.setTimeout(() => (poweringOn.value = false), 640)
  // 首次手势：键盘或鼠标任一路径都能触发询问
  window.addEventListener('keydown', onFirstGesture, { once: false })
  window.addEventListener('click', onFirstGesture, { once: false })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onFirstGesture)
  window.removeEventListener('click', onFirstGesture)
  offGlobal()
  offStart()
  offPrompt()
})

function togglePause() {
  if (promptOpen.value) return
  pauseOpen.value = !pauseOpen.value
  if (pauseOpen.value) playSfx('confirm')
}
</script>

<template>
  <div
    class="app"
    :data-motion="motionEnabled ? 'on' : 'off'"
    :data-locked="inputLocked"
    :data-scope="activeScope"
    :data-zone="focusZone"
  >
    <!-- 唯一的屏幕：crt 类挂载扫描线/荫罩/暗角三层质感 -->
    <div class="screen crt" :class="{ 'crt-on': poweringOn, 'crt-flicker': motionEnabled }">
      <!-- 顶部标签栏：只在浏览类页面上出现，文章详情自带返回 -->
      <TabBar v-if="onTabScene" />

      <div ref="screenInner" class="screen-inner">
        <component :is="currentComponent" :key="sceneKey" />
      </div>

      <!-- 场景转场遮罩：整屏像素切换 -->
      <div v-if="isTransitioning" class="trans" :class="`k-${transitionKind}`" />

      <!-- 暂停菜单 -->
      <PauseMenu v-if="pauseOpen" @close="pauseOpen = false" />

      <!-- 音效首次询问：键鼠双路径 -->
      <div v-if="promptOpen" class="prompt-mask">
        <div class="prompt px">
          <div class="prompt-title">音效检查</div>
          <p class="prompt-text">
            本站有 8bit 音效（光标移动 / 确认 / 点赞 / 转场）。<br />
            要开启吗？随时可在菜单里更改。
          </p>
          <div class="prompt-actions">
            <button
              class="prompt-btn focusable mini"
              data-testid="prompt-on"
              :class="{ on: promptFocus === 0, 'is-focused': promptFocus === 0 }"
              @mouseenter="promptFocus = 0"
              @click="choosePrompt(true)"
            >
              ▶ 开启音效
            </button>
            <button
              class="prompt-btn focusable mini"
              data-testid="prompt-off"
              :class="{ on: promptFocus === 1, 'is-focused': promptFocus === 1 }"
              @mouseenter="promptFocus = 1"
              @click="choosePrompt(false)"
            >
              保持静音
            </button>
          </div>
          <div class="prompt-keys hint">←→ 选择 · ENTER 确认 · ESC 保持静音</div>
        </div>
      </div>
    </div>

    <!-- 屏幕下沿：软按键条。既是提示，也是可点的控件（鼠标路径） -->
    <div class="deck px px-12">
      <span class="deck-scene">
        <b v-for="s in SCENES" :key="s.id" :class="{ on: s.id === frame.id }">
          {{ s.id === frame.id ? s.label : '·' }}
        </b>
      </span>

      <span class="deck-keys">
        <button class="softkey focusable mini" @click="togglePause">菜单 (P)</button>
        <span
          class="softkey focusable mini"
          @click="((setSound(!soundEnabled)), soundEnabled && previewSfx('confirm'))"
        >
          音效 {{ soundEnabled ? 'ON' : 'OFF' }}
        </span>
      </span>

      <span class="deck-src" :class="dataSource">
        {{ dataSource === 'live' ? '● LIVE' : '○ DEMO' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  background: var(--paper-alt);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
  gap: 6px;
  overflow: hidden;
}

/* 屏幕：唯一的画布。改成纵向 flex，好让标签栏与滚动区各就各位 */
.screen {
  flex: 1;
  position: relative;
  border: 3px solid var(--edge);
  background: var(--paper);
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

.trans {
  position: absolute;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}

.k-flash {
  background: var(--blue-200);
  animation: trans-flash 280ms steps(1, end) 1;
}

@keyframes trans-flash {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}

.k-wipe {
  background: repeating-linear-gradient(90deg, var(--blue-400) 0 24px, transparent 24px 48px);
  animation: trans-wipe 280ms steps(6, end) 1;
}

@keyframes trans-wipe {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.k-shake {
  background: var(--blue-300);
  animation: trans-shake 280ms steps(2, end) 1;
}

@keyframes trans-shake {
  0%, 100% { opacity: 0; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-8px); }
  70% { opacity: 1; transform: translateY(8px); }
}

/* ── 音效询问 ── */
.prompt-mask {
  position: absolute;
  inset: 0;
  z-index: 220;
  background: rgba(18, 58, 82, 0.3);
  display: grid;
  place-items: center;
  padding: 20px;
}

.prompt {
  width: min(460px, 100%);
  background: var(--paper);
  border: 3px solid var(--blue-600);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 16px 18px;
}

.prompt-title {
  font-size: 24px;
  color: var(--blue-600);
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 6px;
  margin-bottom: 10px;
}

.prompt-text {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13.5px;
  line-height: 1.9;
  margin: 0 0 14px;
  color: var(--ink);
}

.prompt-actions {
  display: flex;
  gap: 8px;
}

.prompt-btn {
  flex: 1;
  font: inherit;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--ink);
  padding: 10px 8px;
  cursor: pointer;
}

.prompt-btn.on {
  border-color: var(--blue-500);
}

.prompt-keys {
  margin-top: 10px;
}

/* ── 底部软按键条 ── */
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
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.softkey {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
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
</style>
