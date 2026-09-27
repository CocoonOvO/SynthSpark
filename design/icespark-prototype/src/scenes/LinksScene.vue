<script setup lang="ts">
/**
 * LINKS 场景：关联链接
 *
 * 对应后端 GET /api/links/（存 external_links 表，默认无数据）。
 * 真接口返回空数组时也要有东西可看，因此数据层会退回内置样张（见 data/api.ts）。
 *
 * 键盘：两列栅格按视觉相邻移动（与文章列表同一套 spatialIndex），ENTER 打开。
 * 站内路径（以 / 开头）走前端切换，绝对链接开新标签页。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { useStatusBar, scrollScreenTop } from '../ui/scene'
import { focusTabs, switchTab, TAB_IDS } from '../ui/tabs'
import { useFocusGroup, spatialIndex } from '../ui/focus'
import { playSfx } from '../ui/sfx'
import { store, loadLinks, dataSource, type Link } from '../data/api'
import SceneHead from '../ui/SceneHead.vue'

usePad()
const { clock, stop } = useStatusBar()

const COLS = 2
const links = computed(() => store.links.value)
const gridFocus = useFocusGroup()

onMounted(() => {
  scrollScreenTop()
  void loadLinks()
})
onUnmounted(stop)

const off = onPad((a) => {
  const n = links.value.length
  if (a === 'confirm') {
    open(links.value[gridFocus.index.value])
    return true
  }
  if (a === 'cancel') {
    focusTabs()
    return true
  }
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    const next = spatialIndex(gridFocus.index.value, a, COLS, n)
    if (next === null) {
      // 首行再往上 → 焦点交给标签栏；其余方向不消费（不制造死键）
      if (a === 'up') {
        focusTabs()
        return true
      }
      return false
    }
    gridFocus.set(next)
    return true
  }
  return false
})
onUnmounted(off)

/** 站内路径直接在前端切换，绝对链接开新标签页 */
function open(l?: Link) {
  if (!l) return
  playSfx('confirm')
  if (l.url.startsWith('http')) {
    window.open(l.url, '_blank', 'noopener,noreferrer')
    return
  }
  const path = l.url.replace(/^\/+/, '')
  if (TAB_IDS.includes(path)) switchTab(path)
  else window.open(l.url, '_blank', 'noopener,noreferrer')
}

function hoverCard(i: number) {
  gridFocus.hover(i)
}
function clickCard(l: Link, i: number) {
  gridFocus.hover(i)
  open(l)
}

/** 没有图标素材：用序号生成像素铭牌，正好符合机器语言 */
function plate(i: number) {
  return String(i + 1).padStart(2, '0')
}
</script>

<template>
  <div class="links">
    <SceneHead title="关联 · LINKS" :clock="clock">
      <span :class="dataSource">{{ dataSource === 'live' ? '● LIVE' : '○ DEMO' }}</span>
    </SceneHead>

    <p class="lead px">
      站外入口与站内服务挂载点。接口 <b>GET /api/links/</b> 返回空时展示的是内置样张。
    </p>

    <div v-if="!links.length" class="state px">
      <p class="state-title">这里还没有配置任何链接。</p>
      <p class="state-hint hint">超管可以在后台「外链管理」里添加（POST /api/links/）。</p>
    </div>

    <div v-else class="grid" data-testid="links-grid">
      <a
        v-for="(l, i) in links"
        :key="l.id"
        class="card focusable"
        data-testid="link-card"
        :class="{ 'is-focused': gridFocus.index.value === i }"
        :href="l.url"
        @mouseenter="hoverCard(i)"
        @click.prevent="clickCard(l, i)"
      >
        <span class="plate px">{{ plate(i) }}</span>
        <span class="card-main">
          <span class="card-name">{{ l.name }}</span>
          <span class="card-desc read">{{ l.description || '（没有说明）' }}</span>
          <span class="card-url px">{{ l.url }}</span>
        </span>
        <span class="card-go px">↗</span>
      </a>
    </div>

    <div class="foot px hint">
      ↑↓←→ 按位置移动 · ENTER / 点击打开 · ESC 回标签栏 · 站内路径在前端切换，绝对链接开新页
    </div>
  </div>
</template>

<style scoped>
.links {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 14px;
}

.lead {
  margin: 0;
  color: var(--ink-soft);
}

.lead b {
  font-weight: 400;
  color: var(--blue-600);
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 3px dashed var(--blue-400);
  min-height: 220px;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin: 0;
}

.state-hint {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(120px, 1fr);
  gap: 12px;
  align-content: start;
}

.card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 14px;
  text-decoration: none;
  color: var(--ink);
  cursor: pointer;
}

.plate {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: var(--blue-200);
  border: 2px solid var(--blue-500);
  color: var(--blue-700);
  font-size: 24px;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.card-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
}

.card-desc {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.8;
}

.card-url {
  color: var(--ink-faint);
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-go {
  color: var(--blue-500);
  font-size: 24px;
}

.foot {
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
