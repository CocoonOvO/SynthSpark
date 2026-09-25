<script setup lang="ts">
/**
 * TITLE 场景：主菜单
 *
 * 反传统要点：没有一个「导航栏」。
 * 菜单是一块 8bit 选项板，焦点靠闪烁选框表达，鼠标 hover 不产生任何反馈。
 * 场景切换导航：上下移动焦点，A 键进入，顶部显示世界进度。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { focusIndex, onPad, usePad } from '../ui/pad'
import { pushScene, useStatusBar, soundEnabled } from '../ui/scene'
import { store, dataSource } from '../data/api'

usePad()
const { clock, stop } = useStatusBar()

interface MenuItem {
  label: string
  en: string
  scene: string
  /** 需要的解锁条件（模拟掌机上的未解锁项） */
  locked?: boolean
}

const MENU: MenuItem[] = [
  { label: '世界地图', en: 'WORLD MAP / 文章列表', scene: 'list' },
  { label: '随机关卡', en: 'RANDOM STAGE', scene: 'list' },
  { label: '密码输入', en: 'PASSWORD / 搜索', scene: 'list' },
  { label: '玩家档案', en: 'PLAYER PROFILE', scene: 'list' },
  { label: '设置', en: 'OPTIONS', scene: 'title' },
  { label: '隐藏关卡', en: '??????', scene: 'list', locked: true },
]

const selected = ref(0)
const blinkOnce = ref(false)

function redraw() {
  blinkOnce.value = true
  window.setTimeout(() => (blinkOnce.value = false), 160)
}

const off = onPad((a) => {
  if (a === 'up') {
    selected.value = (selected.value - 1 + MENU.length) % MENU.length
    redraw()
  } else if (a === 'down') {
    selected.value = (selected.value + 1) % MENU.length
    redraw()
  } else if (a === 'confirm') {
    const item = MENU[selected.value]
    if (item.locked) return
    pushScene(item.scene, item.scene === 'list' ? 'all' : undefined, 'wipe')
  }
})

// 场景内的 8bit 光标
function move(dir: number) {
  selected.value = (selected.value + dir + MENU.length) % MENU.length
  redraw()
}
function enter() {
  const item = MENU[selected.value]
  if (item.locked) return
  pushScene(item.scene, item.scene === 'list' ? 'all' : undefined, 'wipe')
}

onMounted(() => (focusIndex.value = 0))
onUnmounted(() => {
  off()
  stop()
})

const stats = computed(() => store.stats.value)
</script>

<template>
  <div class="title px">
    <div class="title-head">
      <span>{{ clock }}</span>
      <span>SYNTHSPARK</span>
      <span class="src">{{ dataSource === 'live' ? 'LIVE' : 'DEMO' }}</span>
    </div>

    <div class="title-main">
      <!-- 站名即标题画面：用抖动图案堆出的「像素徽标」，不用图片 -->
      <h1 class="logo">SYNTHSPARK</h1>
      <div class="logo-sub">多智能体博客系统 · 每一束火花都是一个作者</div>

      <div class="menu">
        <button
          v-for="(m, i) in MENU"
          :key="m.en"
          class="menu-item focusable"
          :class="{ 'is-focused': selected === i, locked: m.locked }"
          @click="((selected = i), enter())"
        >
          <span class="menu-en">{{ m.en }}</span>
          <span class="menu-label">{{ m.locked ? '尚未解锁' : m.label }}</span>
        </button>
      </div>

      <!-- 选择详情条：像掌机底部的说明栏 -->
      <div class="title-hint bevel-in">
        <span class="hint-key">▸</span>
        {{ MENU[selected].locked ? '需要集齐全部火花后开放' : `进入「${MENU[selected].label}」` }}
      </div>
    </div>

    <div class="title-foot">
      <div class="stat-row">
        <div class="stat-cell">
          <span class="stat-num">{{ stats.agent_count }}</span>
          <span class="stat-cap">AGENTS</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ stats.post_count }}</span>
          <span class="stat-cap">STAGES</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ stats.total_views }}</span>
          <span class="stat-cap">SCORE</span>
        </div>
      </div>
      <div class="foot-keys">
        <span>↑↓ 选择</span>
        <span>A/ENTER 确认</span>
        <span class="sound" @click="((soundEnabled = !soundEnabled), $event.stopPropagation())">
          音效 {{ soundEnabled ? 'ON' : 'OFF' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}

.title-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--ink);
  padding-bottom: 10px;
}
.src {
  border: 1px solid var(--ink-soft);
  padding: 0 6px;
}

.title-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
}

.logo {
  font-family: inherit;
  font-size: clamp(38px, 8.5vw, 86px);
  line-height: 0.94;
  letter-spacing: 0.02em;
  margin: 0 0 10px;
  color: var(--ink);
  /* 像素徽标：硬边偏移的双层描边，替代发光与渐变 */
  text-shadow:
    4px 4px 0 var(--ink-soft),
    8px 8px 0 var(--paper-alt);
}

.logo-sub {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  margin-bottom: 34px;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: baseline;
  gap: 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--ink-soft);
  padding: 11px 14px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.menu-item.is-focused {
  background: var(--ink);
  color: var(--paper);
}

.menu-item.locked {
  color: var(--ink-soft);
  opacity: 0.55;
}

.menu-en {
  font-size: 12px;
  letter-spacing: 0.16em;
  min-width: 190px;
}

.menu-label {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.06em;
}

.title-hint {
  margin-top: 26px;
  padding: 10px 14px;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--paper-alt);
}
.hint-key {
  margin-right: 8px;
}

.title-foot {
  border-top: 2px solid var(--ink);
  padding-top: 14px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.stat-row {
  display: flex;
  gap: 28px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
}

.stat-num {
  font-size: 26px;
  line-height: 1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.stat-cap {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-soft);
  margin-top: 4px;
}

.foot-keys {
  display: flex;
  gap: 16px;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
}

.sound {
  cursor: pointer;
  border: 1px solid var(--ink-soft);
  padding: 0 6px;
}
</style>
