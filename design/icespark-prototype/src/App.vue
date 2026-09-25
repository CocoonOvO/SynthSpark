<script setup lang="ts">
/**
 * icespark 应用外壳
 *
 * 职责：
 * - 场景栈渲染 + 整屏像素转场（闪白/擦除/抖屏）
 * - 8bit 显像管质感（扫描线 / 荧光点阵 / 暗角 / 辉光 / 开机亮线）
 * - 开机动画播完自动进入主页，无需等待输入
 *
 * 注：塑料机身外壳已按用户要求移除，画面即屏幕，全部空间让给内容与交互
 */
import { computed, onMounted, ref } from 'vue'
import { sceneStack, isTransitioning, transitionKind, currentScene } from './ui/scene'
import { ROLES, SCENES } from './styles/tokens'
import { loadSiteConfig, loadStats, dataSource } from './data/api'
import BootScene from './scenes/BootScene.vue'
import TitleScene from './scenes/TitleScene.vue'
import WorldScene from './scenes/WorldScene.vue'
import StageScene from './scenes/StageScene.vue'

/** 开机瞬间的显像管亮线动画 */
const poweringOn = ref(true)

const cssVars = computed(() => ({ ...ROLES }))

const SCENE_MAP: Record<string, any> = {
  boot: BootScene,
  title: TitleScene,
  list: WorldScene,
  article: StageScene,
}

const frame = computed(() => currentScene.value)
const currentComponent = computed(() => SCENE_MAP[frame.value.id] || BootScene)

onMounted(() => {
  loadSiteConfig()
  loadStats()
  // 显像管亮线张开：640ms 后结束，不阻塞内容
  window.setTimeout(() => (poweringOn.value = false), 640)
})
</script>

<template>
  <div class="app" :style="cssVars">
    <!-- 唯一的屏幕：crt 类挂载扫描线/荫罩/暗角三层质感 -->
    <div class="screen crt crt-flicker" :class="{ 'crt-on': poweringOn }">
      <div class="screen-inner">
        <component :is="currentComponent" :key="frame.id + (frame.param || '')" />
      </div>

      <!-- 场景转场遮罩：整屏像素切换 -->
      <div v-if="isTransitioning" class="trans" :class="`k-${transitionKind}`" />
    </div>

    <!-- 屏幕下沿：极简状态条，让「场景切换」可见，不做机身 -->
    <div class="deck px px-12">
      <span class="deck-scene">
        <b v-for="s in SCENES" :key="s.id" :class="{ on: s.id === frame.id }">
          {{ s.id === frame.id ? s.label : '·' }}
        </b>
      </span>
      <span class="deck-tip">↑↓←→ 移动　A/ENTER 确认　B/ESC 返回</span>
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
  animation: trans-flash 320ms steps(1, end) 1;
}

@keyframes trans-flash {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}

.k-wipe {
  background: repeating-linear-gradient(90deg, var(--blue-400) 0 24px, transparent 24px 48px);
  animation: trans-wipe 320ms steps(6, end) 1;
}

@keyframes trans-wipe {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.k-shake {
  background: var(--blue-300);
  animation: trans-shake 320ms steps(2, end) 1;
}

@keyframes trans-shake {
  0%, 100% { opacity: 0; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-8px); }
  70% { opacity: 1; transform: translateY(8px); }
}

/* 极简状态条 */
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

.deck-tip {
  margin-left: auto;
}

.deck-src.live {
  color: var(--blue-600);
}
</style>
