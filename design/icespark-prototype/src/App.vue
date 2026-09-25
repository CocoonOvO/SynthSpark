<script setup lang="ts">
/**
 * icespark 应用外壳
 *
 * 职责：
 * - 场景栈渲染 + 整屏像素转场
 * - 8bit 显像管质感（扫描线 / 荧光点阵 / 暗角 / 辉光 / 开机亮线）
 * - 信号档（0–3）统一控制 CRT 强度、字体模式、动效强度
 * - START 暂停菜单（全局导航 + 全局设置）
 * - 音效首次询问
 *
 * 注：塑料机身外壳已移除，画面即屏幕，全部空间让给内容与交互
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { isTransitioning, transitionKind, currentScene, screenScroller } from './ui/scene'
import { SCENES } from './styles/tokens'
import {
  signalLevel,
  soundEnabled,
  setSound,
  soundPromptShown,
  markSoundPromptShown,
  SIGNAL_LABELS,
} from './ui/prefs'
import { playSfx, previewSfx } from './ui/sfx'
import { onPad, activeScope, inputLocked } from './ui/pad'
import { loadSiteConfig, loadStats, dataSource } from './data/api'
import PauseMenu from './ui/PauseMenu.vue'
import BootScene from './scenes/BootScene.vue'
import TitleScene from './scenes/TitleScene.vue'
import WorldScene from './scenes/WorldScene.vue'
import StageScene from './scenes/StageScene.vue'

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

const SCENE_MAP: Record<string, any> = {
  boot: BootScene,
  title: TitleScene,
  list: WorldScene,
  article: StageScene,
}

const frame = computed(() => currentScene.value)
const currentComponent = computed(() => SCENE_MAP[frame.value.id] || BootScene)

/** START 是全局键：注册在 any 作用域，任何场景下都能呼出暂停菜单 */
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
  window.setTimeout(() => (poweringOn.value = false), 640)
  // 首次手势：键盘或鼠标任一路径都能触发询问
  window.addEventListener('keydown', onFirstGesture, { once: false })
  window.addEventListener('click', onFirstGesture, { once: false })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onFirstGesture)
  window.removeEventListener('click', onFirstGesture)
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
    :data-signal="signalLevel"
    :data-locked="inputLocked"
    :data-scope="activeScope"
  >
    <!-- 唯一的屏幕：crt 类挂载扫描线/荫罩/暗角三层质感 -->
    <div
      class="screen crt"
      :class="{ 'crt-on': poweringOn, 'crt-flicker': signalLevel === 3 }"
    >
      <div ref="screenInner" class="screen-inner">
        <component :is="currentComponent" :key="frame.id + (frame.param || '')" />
      </div>

      <!-- 场景转场遮罩：整屏像素切换 -->
      <div v-if="isTransitioning" class="trans" :class="`k-${transitionKind}`" />

      <!-- START 暂停菜单 -->
      <PauseMenu v-if="pauseOpen" @close="pauseOpen = false" />

      <!-- 音效首次询问：键鼠双路径 -->
      <div v-if="promptOpen" class="prompt-mask">
        <div class="prompt px">
          <div class="prompt-title">SOUND CHECK</div>
          <p class="prompt-text">
            本站有 8bit 音效（光标移动 / 确认 / 加心 / 转场）。<br />
            要开启吗？随时可在 START 菜单里更改。
          </p>
          <div class="prompt-actions">
            <button
              class="prompt-btn"
              :class="{ on: promptFocus === 0 }"
              @mouseenter="promptFocus = 0"
              @click="choosePrompt(true)"
            >
              ▶ 开启音效
            </button>
            <button
              class="prompt-btn"
              :class="{ on: promptFocus === 1 }"
              @mouseenter="promptFocus = 1"
              @click="choosePrompt(false)"
            >
              保持静音
            </button>
          </div>
          <div class="prompt-keys">←→ 选择　A/ENTER 确认　B/ESC 保持静音</div>
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
        <button class="softkey" @click="togglePause">START 菜单 (P)</button>
        <span class="softkey signal-key" @click="pauseOpen = true">
          SIGNAL {{ signalLevel }} · {{ SIGNAL_LABELS[signalLevel] }}
        </span>
        <span class="softkey" @click="((setSound(!soundEnabled)), soundEnabled && previewSfx('confirm'))">
          音效 {{ soundEnabled ? 'ON' : 'OFF' }}
        </span>
      </span>

      <span class="deck-src" :class="dataSource">{{ dataSource === 'live' ? '● LIVE' : '○ DEMO' }}</span>
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

/* 屏幕：唯一的画布 */
.screen {
  flex: 1;
  position: relative;
  border: 3px solid var(--edge);
  background: var(--paper);
  overflow: hidden;
  min-height: 0;
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
}

.screen-inner {
  position: absolute;
  inset: 0;
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
  background: var(--blue-200);
  border-color: var(--blue-500);
  box-shadow: inset 0 0 0 2px var(--blue-500);
}

.prompt-keys {
  margin-top: 10px;
  color: var(--ink-faint);
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
