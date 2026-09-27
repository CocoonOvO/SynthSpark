<script setup lang="ts">
/**
 * POSTS 场景：文章列表
 *
 * 用户反馈第 6、7 条都落在这个场景：
 * · 卡片带封面（有 / 无封面混排时，封面区高度一致 —— 靠 ImageFrame 的固定宽高比）
 * · 保留两列，但方向键按**视觉相邻**移动（↑ 同列上一行、←→ 同行左右、↓ 同列下一行），
 *   不再是一张一张依次切换
 * · 翻页改用 PgUp / PgDn（方向键专心做焦点移动），并配 8bit 风格的整屏滚动动效
 * · 上一页 / 下一页按钮保留，鼠标路径同样可用
 *
 * 浏览状态（第几页 / 当前分组 / 当前标签）存在 tabs.ts 的 postsView 里，
 * 因此「进文章 → 返回上一页」回来时还停在原来的页码上。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { pushScene, useStatusBar, scrollScreenTop } from '../ui/scene'
import { focusTabs, postsView } from '../ui/tabs'
import { useFocusGroup, spatialIndex } from '../ui/focus'
import { playSfx } from '../ui/sfx'
import { pageSize, motionEnabled } from '../ui/prefs'
import { store, loadPosts, loadGroups, loadTags, dataSource, shortDate, type PostListItem } from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import ImageFrame from '../ui/ImageFrame.vue'
import SceneHead from '../ui/SceneHead.vue'
import { AVATAR_PALETTE } from '../styles/tokens'

usePad()
const { clock, stop } = useStatusBar()

const COLS = 2

onMounted(() => {
  scrollScreenTop()
  void loadPosts(60)
  void loadGroups()
  void loadTags()
})
onUnmounted(() => {
  if (turnTimer) window.clearTimeout(turnTimer)
  stop()
})

// ── 筛选 ──

const filters = computed(() => [
  { key: 'all', label: '全部' },
  ...store.groups.value.map((g) => ({ key: `g:${g.name}`, label: g.name })),
  ...store.tags.value.map((t) => ({ key: `t:${t.name}`, label: `#${t.name}` })),
])

const filtered = computed(() => {
  const { group, tag } = postsView.value
  return store.posts.value.filter((p) => {
    if (group && p.group_name !== group) return false
    if (tag && !p.tags.includes(tag)) return false
    return true
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

/** 页码收敛：换每页条数或换筛选后可能越界 */
watch([pageCount, pageSize], () => {
  if (postsView.value.page > pageCount.value - 1) postsView.value.page = pageCount.value - 1
  if (postsView.value.page < 0) postsView.value.page = 0
  clampFocus()
})

const pagePosts = computed(() => {
  const start = postsView.value.page * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/** 焦点：0 = 筛选行，1 = 卡片栅格 */
const zone = ref(1)
const gridFocus = useFocusGroup()
const filterIdx = ref(0)

function clampFocus() {
  const n = pagePosts.value.length
  if (n === 0) gridFocus.set(0, true)
  else if (gridFocus.index.value >= n || gridFocus.index.value < 0) gridFocus.set(n - 1, true)
  const f = filters.value.length
  if (filterIdx.value >= f) filterIdx.value = Math.max(0, f - 1)
}

// ── 翻页（PgUp / PgDn） ──

const turnDir = ref<'' | 'next' | 'prev'>('')
const bumping = ref(false)
let turnTimer: number | null = null
let bumpTimer: number | null = null

function goPage(next: number, dir: 1 | -1) {
  postsView.value.page = next
  gridFocus.set(0, true)
  scrollScreenTop()
  if (motionEnabled.value) {
    turnDir.value = dir > 0 ? 'next' : 'prev'
    if (turnTimer) window.clearTimeout(turnTimer)
    turnTimer = window.setTimeout(() => (turnDir.value = ''), 300)
  }
}

function turn(dir: 1 | -1) {
  const next = postsView.value.page + dir
  if (next < 0 || next > pageCount.value - 1) {
    // 到边界：抖一下，让用户知道按键被听见了，只是过不去
    bumping.value = true
    if (bumpTimer) window.clearTimeout(bumpTimer)
    bumpTimer = window.setTimeout(() => (bumping.value = false), 380)
    return
  }
  playSfx('transition')
  goPage(next, dir)
}

// ── 键盘 ──

const off = onPad((a) => {
  if (a === 'pagePrev') {
    turn(-1)
    return true
  }
  if (a === 'pageNext') {
    turn(1)
    return true
  }

  const n = pagePosts.value.length

  if (a === 'up') {
    if (zone.value === 0) {
      // 筛选行的首项再往上 → 焦点交给标签栏
      if (filterIdx.value === 0) {
        focusTabs()
        return true
      }
      filterIdx.value -= 1
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'up', COLS, n)
    if (next === null) {
      zone.value = 0
      playSfx('move')
      return true
    }
    gridFocus.set(next)
    return true
  }

  if (a === 'down') {
    if (zone.value === 0) {
      zone.value = 1
      gridFocus.set(0, true)
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'down', COLS, n)
    if (next === null) return false
    gridFocus.set(next)
    return true
  }

  if (a === 'left') {
    if (zone.value === 0) {
      if (filterIdx.value === 0) return false
      filterIdx.value -= 1
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'left', COLS, n)
    if (next === null) return false
    gridFocus.set(next)
    return true
  }

  if (a === 'right') {
    if (zone.value === 0) {
      if (filterIdx.value >= filters.value.length - 1) return false
      filterIdx.value += 1
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'right', COLS, n)
    if (next === null) return false
    gridFocus.set(next)
    return true
  }

  if (a === 'confirm') {
    if (zone.value === 0) {
      applyFilter(filterIdx.value)
      return true
    }
    open(pagePosts.value[gridFocus.index.value])
    return true
  }

  if (a === 'cancel') {
    // ESC = 回标签栏（键盘从任何位置都能回到全局导航）
    focusTabs()
    return true
  }
  return false
})
onUnmounted(off)

// ── 动作 ──

function applyFilter(i: number) {
  const f = filters.value[i]
  if (!f) return
  playSfx('confirm')
  if (f.key === 'all') postsView.value = { page: 0, group: '', tag: '' }
  else if (f.key.startsWith('g:')) postsView.value = { page: 0, group: f.key.slice(2), tag: '' }
  else postsView.value = { page: 0, group: '', tag: f.key.slice(2) }
  gridFocus.set(0, true)
  scrollScreenTop()
}

function clearFilter() {
  zone.value = 0
  filterIdx.value = 0
  applyFilter(0)
}

function open(p?: PostListItem) {
  if (!p) return
  playSfx('confirm')
  pushScene('article', p.id, 'flash')
}

/** 鼠标：划过共享焦点（静音） */
function hoverCard(i: number) {
  zone.value = 1
  gridFocus.hover(i)
}
function clickCard(p: PostListItem, i: number) {
  hoverCard(i)
  open(p)
}
function hoverFilter(i: number) {
  zone.value = 0
  if (filterIdx.value !== i) filterIdx.value = i
}
function clickFilter(i: number) {
  hoverFilter(i)
  applyFilter(i)
}

function isFilterOn(key: string) {
  const { group, tag } = postsView.value
  if (key === 'all') return !group && !tag
  if (key.startsWith('g:')) return group === key.slice(2)
  return tag === key.slice(2)
}

const activeFilterLabel = computed(() => {
  const { group, tag } = postsView.value
  if (!group && !tag) return ''
  return group ? `分组：${group}` : `标签：${tag}`
})

/** 页码显示用的区间 */
const rangeText = computed(() => {
  const total = filtered.value.length
  if (!total) return '0 / 0'
  const start = postsView.value.page * pageSize.value + 1
  const end = Math.min(total, start + pageSize.value - 1)
  return `${start}-${end} / ${total}`
})
</script>

<template>
  <div class="list">
    <SceneHead title="文章 · POSTS" :clock="clock">
      <span v-if="activeFilterLabel" class="filter-on">
        {{ activeFilterLabel }}
        <button class="filter-x" data-testid="filter-clear" @click="clearFilter">✕ 清除</button>
      </span>
      <span class="range hint">共 {{ rangeText }}</span>
    </SceneHead>

    <!-- 筛选行 -->
    <div class="filters px" data-testid="filters">
      <button
        v-for="(f, i) in filters"
        :key="f.key"
        class="fchip focusable mini"
        :data-testid="`filter-${f.key}`"
        :class="{ on: isFilterOn(f.key), 'is-focused': zone === 0 && filterIdx === i }"
        @mouseenter="hoverFilter(i)"
        @click="clickFilter(i)"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- 加载 / 空态 -->
    <div v-if="dataSource === 'loading' && !store.posts.value.length" class="state px">
      <span class="blink">▌</span> 读取文章中 …
    </div>
    <div v-else-if="!filtered.length" class="state px">
      <p class="state-title">这个条件下一篇文章都没有。</p>
      <p class="state-hint hint">换个分组或标签，或者点右上角的「清除」。</p>
    </div>

    <!-- 卡片栅格：两列，封面区高度一致 -->
    <div
      v-else
      class="grid"
      :class="[turnDir ? `turn-${turnDir}` : '', bumping ? 'bump' : '']"
      data-testid="post-grid"
    >
      <article
        v-for="(p, i) in pagePosts"
        :key="p.id"
        class="card focusable"
        data-testid="post-card"
        :class="{ 'is-focused': zone === 1 && gridFocus.index.value === i }"
        @mouseenter="hoverCard(i)"
        @click="clickCard(p, i)"
      >
        <div class="card-cover">
          <ImageFrame :src="p.cover_image" :alt="p.title" ratio="3 / 2" />
        </div>

        <div class="card-body">
          <h3 class="card-title">{{ p.title }}</h3>
          <p class="card-intro read">{{ p.introduction || '（暂无简介）' }}</p>
          <div class="card-foot px">
          <PixelAvatar
            :src="p.author_avatar"
            :name="p.author_name"
            :size="16"
            :display="24"
            :palette="AVATAR_PALETTE"
          />
          <span class="author">{{ p.author_name }}</span>
          <span class="faint">{{ shortDate(p.created_at) }}</span>
          <span class="faint num">◉ {{ p.view_count }}</span>
          <span class="faint num">♥ {{ p.like_count }}</span>
            <span v-if="p.group_name" class="tag">{{ p.group_name }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- 翻页条 -->
    <div class="foot px">
      <button
        class="pbtn focusable mini"
        data-testid="pager-prev"
        :disabled="postsView.page === 0"
        @click="turn(-1)"
      >
        ◀ 上一页 (PgUp)
      </button>

      <span class="dots">
        <i
          v-for="n in pageCount"
          :key="n"
          class="dot focusable mini"
          :class="{ on: n - 1 === postsView.page }"
          :data-testid="`page-dot-${n}`"
          @click="goPage(n - 1, n - 1 > postsView.page ? 1 : -1)"
        />
      </span>

      <span class="pcount">PAGE {{ postsView.page + 1 }} / {{ pageCount }}</span>

      <button
        class="pbtn focusable mini"
        data-testid="pager-next"
        :disabled="postsView.page >= pageCount - 1"
        @click="turn(1)"
      >
        下一页 (PgDn) ▶
      </button>

      <span class="keys hint">
        ↑↓←→ 按位置移动 · PgUp/PgDn 翻页 · ENTER 打开 · ESC 回标签栏
      </span>
    </div>
  </div>
</template>

<style scoped>
.list {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 12px;
}

.filter-on {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--blue-700);
  background: var(--blue-200);
  padding: 1px 6px;
}

.filter-x {
  font: inherit;
  background: var(--paper);
  border: 1.5px solid var(--blue-400);
  color: var(--blue-700);
  padding: 0 4px;
  cursor: pointer;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fchip {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-300);
  color: var(--ink-soft);
  padding: 3px 9px;
  cursor: pointer;
}

.fchip.on {
  background: var(--blue-500);
  border-color: var(--blue-600);
  color: var(--paper);
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 3px dashed var(--blue-400);
  color: var(--ink);
  min-height: 240px;
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
  /* 两列不变（用户要求），但卡片改成横向：1440 下一格宽 640+，
     竖排卡片会把封面撑到 360px 高，两行直接吃掉整屏 —— 横排才是这个宽度该有的形态 */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 行高按内容走：卡片被拉伸到整行高的话，卡片里会留一大块空白，很难看 */
  grid-auto-rows: auto;
  gap: 12px;
  min-height: 0;
  align-content: start;
}

.card {
  display: flex;
  align-items: stretch;
  gap: 14px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 10px;
  cursor: pointer;
  min-height: 0;
  overflow: hidden;
}

/* 封面区尺寸固定：有封面与无封面卡片混排时高度完全一致（用户反馈第 6 条） */
.card-cover {
  flex: 0 0 320px;
  min-width: 0;
  /* 画框自己保持 3:2，不跟着文字列拉伸 */
  align-self: flex-start;
}

.card-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.4;
  margin: 0;
  /* 高度锁死两行：标题一行还是两行，卡片高度都一样，栅格才齐 */
  min-height: 2.8em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft);
  min-height: 3.6em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 2px solid var(--blue-200);
  padding-top: 6px;
  color: var(--ink-soft);
  flex-wrap: wrap;
  flex: 0 0 auto;
  margin-top: auto;
}

.card-foot .author {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 12.5px;
}

.faint {
  color: var(--ink-faint);
}

.num {
  font-variant-numeric: tabular-nums;
}

.tag {
  margin-left: auto;
  border: 1.5px solid var(--blue-400);
  padding: 0 5px;
  color: var(--blue-700);
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 2px solid var(--blue-300);
  padding-top: 10px;
  flex-wrap: wrap;
  margin-top: auto;
}

.pbtn {
  font: inherit;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 5px 12px;
  cursor: pointer;
}

.pbtn:disabled {
  opacity: 0.35;
  cursor: default;
}

.dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 12px;
  height: 12px;
  border: 2px solid var(--blue-400);
  cursor: pointer;
}

.dot.on {
  background: var(--blue-500);
}

.pcount {
  color: var(--ink-soft);
}

.keys {
  margin-left: auto;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .card-cover {
    flex: 0 0 200px;
  }
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .card-cover {
    flex: 0 0 120px;
  }
}
</style>
