<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import {
  markSoundPromptShown,
  motionEnabled,
  setSound,
  soundEnabled,
  soundPromptShown,
} from '@/config/prefs'
import { mountInput } from '@/input'
import { onPad } from '@/input/pad'
import { activeScope, focusZone, inputLocked } from '@/input/scopes'
import { playSfx, previewSfx } from '@/input/sfx'
import PauseMenu from '@/machine/PauseMenu.vue'
import SoundPrompt from '@/machine/SoundPrompt.vue'
import { currentScene, sceneSeq } from '@/scene/presenter'
import { SCENES } from '@/scene/scenes'
import { isTransitioning, transitionKind, transitionSeq } from '@/scene/transition'
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

/** 音效询问是否打开 */
const promptOpen = ref(false)

/** 暂停菜单是否打开（P / 底栏「菜单 (P)」软键） */
const pauseOpen = ref(false)

const site = useSiteStore()

let bootTimer = 0
let detachInput: (() => void) | null = null

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

/** 软键：音效开关（鼠标路径；键盘路径是 Tab + ENTER） */
function toggleSound(): void {
  setSound(!soundEnabled.value)
  if (soundEnabled.value) previewSfx('confirm')
}

/** 软键：呼出暂停菜单（与 P 键同一条路径） */
function togglePause(): void {
  if (promptOpen.value) return
  pauseOpen.value = !pauseOpen.value
  if (pauseOpen.value) playSfx('confirm')
}

/**
 * P 是全局键：任何场景下都能呼出暂停菜单。
 *
 * 菜单自己开着时由它（pause 作用域）先消费掉这个键来关闭，
 * 所以这里要看 `consumed` —— 否则会「关掉又立刻打开」。
 */
const offStart = onPad((action, consumed) => {
  if (consumed || action !== 'start') return false
  if (promptOpen.value) return true
  togglePause()
  return true
}, 'any')

onMounted(() => {
  bootTimer = window.setTimeout(() => (poweringOn.value = false), SCALE.motion.boot)

  if (root.value) detachInput = mountInput(root.value)

  // 一次性手势监听：两条路径（键盘 / 鼠标）都可能先发生
  root.value?.addEventListener('keydown', onFirstGesture)
  root.value?.addEventListener('pointerdown', onFirstGesture)
})

onUnmounted(() => {
  window.clearTimeout(bootTimer)
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
    :data-scene="currentScene"
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
      <!-- 顶部标签栏（P3 起在这里渲染，只在浏览类页面出现） -->

      <div class="screen-inner">
        <RouterView />
      </div>

      <!-- 场景转场遮罩：整屏像素切换。key 变了就重播一遍动画（见 scene/transition.ts） -->
      <div
        v-if="isTransitioning"
        :key="transitionSeq"
        class="trans"
        :class="`k-${transitionKind}`"
        data-testid="transition"
      />

      <!-- 暂停菜单（P / 底栏软键呼出） -->
      <PauseMenu v-if="pauseOpen" @close="pauseOpen = false" />

      <!-- 音效首次询问：键鼠双路径的模态 -->
      <SoundPrompt v-if="promptOpen" @close="promptOpen = false" />
    </div>

    <!-- 屏幕下沿：软按键条。既是提示，也是可点的控件（鼠标路径） -->
    <!-- 语义上它就是站点页脚：给底栏一个 contentinfo 地标，屏幕阅读器能直达 -->
    <div class="deck px px-12" role="contentinfo" data-testid="deck">
      <span class="deck-scene" data-testid="deck-scene">
        <b v-for="scene in SCENES" :key="scene.id" :class="{ on: scene.id === currentScene }">
          {{ scene.id === currentScene ? scene.label : '·' }}
        </b>
      </span>

      <!-- 必要小字：版权 · 口号 · 备案（**在软键左侧**）。空字段整段省略（不留下孤零零的 ` · `） -->
      <p class="deck-footer" data-testid="deck-footer">
        <template v-for="(segment, index) in site.footerParts" :key="segment.kind">
          <span v-if="index > 0" class="deck-dot" aria-hidden="true">·</span>
          <span class="deck-seg" :class="`is-${segment.kind}`">{{ segment.text }}</span>
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

/* 窄屏优先丢口号：版权与备案是必要信息，口号不是 */
@media (max-width: 900px) {
  .deck-seg.is-slogan,
  .deck-seg.is-slogan + .deck-dot {
    display: none;
  }
}
</style>
