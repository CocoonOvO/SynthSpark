<script setup lang="ts">
/**
 * 样机外壳
 *
 * 职责：
 * - 场景栈渲染 + 整屏像素转场（闪白/擦除/抖屏）
 * - 调色板 A/B 实时切换（不刷新、不重载，纯 CSS 变量换血）
 * - 机器状态栏：告诉使用者「这是一台机器」
 *
 * 注意：外壳（塑料机身）按用户要求不做，只保留屏幕与最小的机器指示
 */
import { computed, onMounted, ref } from 'vue'
import { sceneStack, isTransitioning, transitionKind } from './ui/scene'
import { rolesOf, PALETTE_A, PALETTE_B, SCENES } from './styles/tokens'
import { store, loadSiteConfig, loadStats, dataSource } from './data/api'
import BootScene from './scenes/BootScene.vue'
import TitleScene from './scenes/TitleScene.vue'
import WorldScene from './scenes/WorldScene.vue'
import StageScene from './scenes/StageScene.vue'

const variant = ref<'A' | 'B'>('B')

/** 调色板 → CSS 变量：换版即换血 */
const cssVars = computed(() => {
  const roles = rolesOf(variant.value === 'A' ? PALETTE_A : PALETTE_B, variant.value)
  return {
    '--ink': roles.ink,
    '--ink-soft': roles.inkSoft,
    '--paper': roles.paper,
    '--paper-alt': roles.paperAlt,
    '--bevel-light': roles.bevelLight,
    '--bevel-dark': roles.bevelDark,
    '--spark': roles.spark,
    '--coin': roles.coin,
  }
})

const SCENE_MAP: Record<string, any> = {
  boot: BootScene,
  title: TitleScene,
  list: WorldScene,
  article: StageScene,
}

const frame = computed(() => sceneStack.value[sceneStack.value.length - 1])
const currentComponent = computed(() => SCENE_MAP[frame.value.id] || BootScene)

onMounted(() => {
  loadSiteConfig()
  loadStats()
})
</script>

<template>
  <div class="shell" :style="cssVars">
    <!-- 机器指示条：屏幕之上的最小硬件感 -->
    <div class="rig px">
      <span class="rig-brand">ICESPARK</span>
      <span class="rig-model">MODEL SYNTHSPARK-01</span>
      <span class="rig-palette">
        <button
          class="pal-btn"
          :class="{ on: variant === 'A' }"
          @click="variant = 'A'"
          title="方案 A：冰蓝 4 阶纯单色"
        >
          A
        </button>
        <button
          class="pal-btn"
          :class="{ on: variant === 'B' }"
          @click="variant = 'B'"
          title="方案 B：冰蓝 8 阶 + 火花强调"
        >
          B
        </button>
        <span class="pal-label">{{ variant === 'A' ? '纯单色 4 阶' : '冰蓝 8 阶 + 火花' }}</span>
      </span>
      <span class="rig-src" :class="dataSource">{{ dataSource === 'live' ? '● LIVE' : '○ DEMO' }}</span>
    </div>

    <!-- 屏幕 -->
    <div class="screen bevel-in">
      <div class="screen-inner">
        <component :is="currentComponent" :key="frame.id + (frame.param || '')" />
      </div>

      <!-- 场景转场遮罩：整屏像素切换，不是淡入淡出 -->
      <div v-if="isTransitioning" class="trans trans-flash" :class="`k-${transitionKind}`" />
    </div>

    <!-- 屏幕下沿：场景指示（让「场景切换」这件事可见） -->
    <div class="deck px">
      <span class="deck-scene">
        场景
        <b v-for="(s, i) in SCENES" :key="s.id" :class="{ on: s.id === frame.id }">
          {{ s.id === frame.id ? s.label : '·' }}
        </b>
      </span>
      <span class="deck-tip">
        ↑↓←→ 移动　A/ENTER 确认　B/ESC 返回　（鼠标点击等同 A 键）
      </span>
      <span class="deck-depth">DEPTH {{ sceneStack.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--paper-alt);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
}

.rig {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  flex-wrap: wrap;
}

.rig-brand {
  color: var(--ink);
  font-size: 13px;
  letter-spacing: 0.24em;
}

.rig-model {
  opacity: 0.7;
}

.rig-palette {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pal-btn {
  font: inherit;
  font-size: 11px;
  width: 24px;
  height: 20px;
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--ink);
  cursor: pointer;
  padding: 0;
}

.pal-btn.on {
  background: var(--ink);
  color: var(--paper);
}

.pal-label {
  margin-left: 4px;
  opacity: 0.8;
}

.rig-src.live {
  color: var(--ink);
}

/* 屏幕：唯一的画布，内容永不溢出到外面 */
.screen {
  flex: 1;
  border: 3px solid var(--ink);
  background: var(--paper);
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.screen-inner {
  /* 绝对定位铺满屏幕：父级高度由 flex 决定时，height:100% 会退化为内容高度 */
  position: absolute;
  inset: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  /* 屏幕内是一个独立的滚动上下文，子场景据此撑满一屏 */
  display: flex;
  flex-direction: column;
}

.screen-inner > * {
  /* flex-basis 必须是 0/auto 之外的拉伸语义：否则内容不足一屏时不会撑满 */
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
  background: var(--ink);
  animation: trans-flash 320ms steps(1, end) 1;
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
  background: repeating-linear-gradient(
    90deg,
    var(--ink) 0 24px,
    transparent 24px 48px
  );
  animation: trans-wipe 320ms steps(6, end) 1;
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
  background: var(--ink);
  animation: trans-shake 320ms steps(2, end) 1;
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

.deck {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
  flex-wrap: wrap;
}

.deck-scene {
  display: flex;
  gap: 8px;
  align-items: center;
}

.deck-scene b {
  font-weight: 700;
  color: var(--ink-soft);
  opacity: 0.45;
}

.deck-scene b.on {
  color: var(--ink);
  opacity: 1;
  border-bottom: 2px solid var(--ink);
}

.deck-tip {
  margin-left: auto;
  opacity: 0.85;
}

.deck-depth {
  border: 1px solid var(--ink-soft);
  padding: 0 6px;
}
</style>
