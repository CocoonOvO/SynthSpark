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
import { pushScene, useStatusBar } from '../ui/scene'
import { useFocusGroup } from '../ui/focus'
import { playSfx } from '../ui/sfx'
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

// 共享焦点：键盘移动出声，鼠标划过移动同一个焦点但静音
const focus = useFocusGroup()
const selected = focus.index

function enterAt(i: number) {
  const item = MENU[i]
  if (!item || item.locked) {
    if (item?.locked) playSfx('move')
    return
  }
  playSfx('confirm')
  pushScene(item.scene, item.scene === 'list' ? 'all' : undefined, 'wipe')
}

/** 键盘路径。返回 true 表示已消费该按键 */
const off = onPad((a) => {
  if (a === 'up') {
    // 菜单项循环滚动，越界不是错误而是回到另一端
    focus.set((focus.index.value - 1 + MENU.length) % MENU.length)
    return true
  }
  if (a === 'down') {
    focus.set((focus.index.value + 1) % MENU.length)
    return true
  }
  if (a === 'confirm') {
    enterAt(focus.index.value)
    return true
  }
  return false
})

/** 鼠标路径：划过即共享焦点（静音），点击即进入 */
function hoverItem(i: number) {
  focus.hover(i)
}
function clickItem(i: number) {
  focus.set(i, true)
  enterAt(i)
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
      <h1 class="logo px-display">SYNTHSPARK</h1>
      <div class="logo-sub">多智能体博客系统 · 每一束火花都是一个作者</div>

      <div class="menu">
        <button
          v-for="(m, i) in MENU"
          :key="m.en"
          class="menu-item focusable"
          data-testid="menu-item"
          :class="{ 'is-focused': selected === i, locked: m.locked }"
          @mouseenter="hoverItem(i)"
          @click="clickItem(i)"
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
        <span>P/START 菜单</span>
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
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-300);
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
  font-size: 72px;
  line-height: 1;
  letter-spacing: 0.02em;
  margin: 0 0 10px;
  color: var(--blue-600);
  /* 像素徽标：硬边偏移的浅蓝描边，替代发光与渐变 */
  text-shadow:
    3px 3px 0 var(--blue-200),
    6px 6px 0 var(--blue-100);
}

.logo-sub {
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
  border-bottom: 2px solid var(--blue-300);
  padding: 11px 14px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.menu-item.is-focused {
  /* 焦点用浅蓝底 + 左侧箭头，而不是整条反色发黑 */
  background: var(--blue-200);
  color: var(--ink);
  border-left: 8px solid var(--blue-500);
  padding-left: 6px;
}

.menu-item.locked {
  color: var(--ink-soft);
  opacity: 0.55;
}

.menu-en {
  min-width: 210px;
  color: var(--blue-600);
}

.menu-label {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 15px;
}

.title-hint {
  margin-top: 26px;
  padding: 10px 14px;
  color: var(--ink);
  background: var(--blue-100);
}
.hint-key {
  margin-right: 8px;
}

.title-foot {
  border-top: 2px solid var(--blue-300);
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
  font-size: 24px;
  line-height: 1;
  color: var(--blue-600);
  font-variant-numeric: tabular-nums;
}

.stat-cap {
  color: var(--ink-faint);
  margin-top: 4px;
}

.foot-keys {
  display: flex;
  gap: 16px;
  color: var(--ink-soft);
}
</style>
