<script setup lang="ts">
/**
 * POSTS 场景：文章列表
 *
 * 用户反馈第 6、7 条都落在这个场景：
 * · 卡片带封面（有 / 无封面混排时，封面区高度一致 —— 靠 ImageFrame 的固定宽高比）
 * · 保留两列，但方向键按**视觉相邻**移动（↑ 同列上一行、←→ 同行左右、↓ 同列下一行）
 * · 翻页用 PgUp / PgDn，另外给了专门的跳页键 J（输入页码回车即达）
 *
 * 第 5 轮改动（用户第 3、6、8 条）：
 * · **分组与标签分两行**：分组是一等公民（「分组选择」不再挤在标签堆里），
 *   两行都可单独用快捷键直达：G 到分组行、T 到标签行
 * · **浏览状态全部写进 URL**（?group=&tag=&page=）：可分享、可前进后退，
 *   从文章详情返回时页码与筛选都还在（因为地址栏里就有）
 * · 新增跳页（J）：输入页码回车跳转，页码越界自动收敛到边界
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onPad, usePad } from '../ui/pad'
import { useStatusBar, scrollScreenTop } from '../ui/scene'
import { focusTabs } from '../ui/tabs'
import { goPosts, goArticle } from '../ui/nav'
import { useFocusGroup, spatialIndex } from '../ui/focus'
import { playSfx } from '../ui/sfx'
import { pageSize, motionEnabled } from '../ui/prefs'
import {
  store,
  loadPosts,
  loadGroups,
  loadTags,
  dataSource,
  shortDate,
  postKey,
  type PostListItem,
} from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import ImageFrame from '../ui/ImageFrame.vue'
import SceneHead from '../ui/SceneHead.vue'
import { AVATAR_PALETTE } from '../styles/tokens'

usePad()
const { clock, stop } = useStatusBar()
const route = useRoute()

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

// ── 浏览状态：唯一来源是地址栏 ──

const curGroup = computed(() => String(route.query.group ?? ''))
const curTag = computed(() => String(route.query.tag ?? ''))
/** URL 里是 1 起的页码，内部用 0 起，避免「第 0 页」这种尴尬写法 */
const pageIndex = computed(() => Math.max(0, (Number(route.query.page) || 1) - 1))

/** 写回地址栏（page 不传即回到第 1 页） */
function applyView(group: string, tag: string, page?: number) {
  goPosts({ group, tag, page })
}

const filtered = computed(() =>
  store.posts.value.filter((p) => {
    if (curGroup.value && p.group_name !== curGroup.value) return false
    if (curTag.value && !p.tags.includes(curTag.value)) return false
    return true
  })
)

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

const pagePosts = computed(() => {
  const start = pageIndex.value * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/** 页码越界（换每页条数 / 手动改 URL / 筛选后条数变少）时收敛回地址栏 */
watch([pageCount, pageSize, pageIndex], () => {
  if (pageIndex.value > pageCount.value - 1) {
    applyView(curGroup.value, curTag.value, pageCount.value)
    return
  }
  clampFocus()
})

// ── 焦点：0 = 分组行，1 = 标签行，2 = 卡片栅格 ──

const zone = ref(2)
const gridFocus = useFocusGroup()
/** 每行第一项都是「全部」，所以两行永远非空，不必处理空行 */
const groupIdx = ref(0)
const tagIdx = ref(0)

const groupOptions = computed(() => [
  { key: '', label: '全部分组', count: store.posts.value.length },
  ...store.groups.value.map((g) => ({ key: g.name, label: g.name, count: g.post_count })),
])

const tagOptions = computed(() => [
  { key: '', label: '全部标签', count: store.posts.value.length },
  ...store.tags.value.map((t) => ({ key: t.name, label: `#${t.name}`, count: t.post_count })),
])

/** 光标跟着 URL 走：从别处带着筛选进来时，行内高亮就在正确的位置 */
watch(
  // 选项是异步加载的：分组/标签到位后要重新对一次，否则带筛选进来时高亮会停在第 0 项
  [curGroup, curTag, groupOptions, tagOptions],
  () => {
    const gi = groupOptions.value.findIndex((o) => o.key === curGroup.value)
    const ti = tagOptions.value.findIndex((o) => o.key === curTag.value)
    if (gi >= 0) groupIdx.value = gi
    if (ti >= 0) tagIdx.value = ti
    clampFocus()
  },
  { immediate: true }
)

function clampFocus() {
  const n = pagePosts.value.length
  if (n === 0) gridFocus.set(0, true)
  else if (gridFocus.index.value >= n || gridFocus.index.value < 0) gridFocus.set(n - 1, true)
}

// ── 翻页（PgUp / PgDn / J） ──

const turnDir = ref<'' | 'next' | 'prev'>('')
const bumping = ref(false)
let turnTimer: number | null = null
let bumpTimer: number | null = null

function goPage(next: number, dir: 1 | -1) {
  gridFocus.set(0, true)
  scrollScreenTop()
  applyView(curGroup.value, curTag.value, next + 1)
  if (motionEnabled.value) {
    turnDir.value = dir > 0 ? 'next' : 'prev'
    if (turnTimer) window.clearTimeout(turnTimer)
    turnTimer = window.setTimeout(() => (turnDir.value = ''), 300)
  }
}

function turn(dir: 1 | -1) {
  const next = pageIndex.value + dir
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

// ── 跳页 ──

const jumpOpen = ref(false)
const jumpValue = ref('1')
const jumpEl = ref<HTMLInputElement | null>(null)

function openJump() {
  jumpOpen.value = true
  jumpValue.value = String(pageIndex.value + 1)
  playSfx('confirm')
  void nextTick(() => {
    jumpEl.value?.focus()
    jumpEl.value?.select()
  })
}

function closeJump() {
  jumpOpen.value = false
}

/** 回车跳转：非数字忽略，越界收敛到 [1, pageCount] */
function submitJump() {
  const n = Math.trunc(Number(jumpValue.value))
  closeJump()
  if (!Number.isFinite(n) || n < 1) {
    bumping.value = true
    if (bumpTimer) window.clearTimeout(bumpTimer)
    bumpTimer = window.setTimeout(() => (bumping.value = false), 380)
    return
  }
  const target = Math.min(Math.max(1, n), pageCount.value)
  if (target - 1 === pageIndex.value) return
  playSfx('transition')
  goPage(target - 1, target - 1 > pageIndex.value ? 1 : -1)
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
  if (a === 'jump') {
    openJump()
    return true
  }
  // 快捷键直达两行（用户第 3 条：分组选择要能一键够到，不必拿方向键蹭上去）
  if (a === 'focusGroup') {
    zone.value = 0
    playSfx('move')
    return true
  }
  if (a === 'focusTag') {
    zone.value = 1
    playSfx('move')
    return true
  }

  const n = pagePosts.value.length

  if (a === 'up') {
    if (zone.value === 0) {
      // 分组行再往上 → 焦点交给标签栏
      focusTabs()
      return true
    }
    if (zone.value === 1) {
      zone.value = 0
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'up', COLS, n)
    if (next === null) {
      zone.value = 1
      playSfx('move')
      return true
    }
    gridFocus.set(next)
    return true
  }

  if (a === 'down') {
    if (zone.value === 0) {
      zone.value = 1
      playSfx('move')
      return true
    }
    if (zone.value === 1) {
      zone.value = 2
      gridFocus.set(0, true)
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, 'down', COLS, n)
    if (next === null) return false
    gridFocus.set(next)
    return true
  }

  if (a === 'left' || a === 'right') {
    const d = a === 'left' ? -1 : 1
    if (zone.value === 0) {
      const next = groupIdx.value + d
      if (next < 0 || next >= groupOptions.value.length) return false
      groupIdx.value = next
      playSfx('move')
      return true
    }
    if (zone.value === 1) {
      const next = tagIdx.value + d
      if (next < 0 || next >= tagOptions.value.length) return false
      tagIdx.value = next
      playSfx('move')
      return true
    }
    const next = spatialIndex(gridFocus.index.value, a, COLS, n)
    if (next === null) return false
    gridFocus.set(next)
    return true
  }

  if (a === 'confirm') {
    if (zone.value === 0) {
      pickGroup(groupIdx.value)
      return true
    }
    if (zone.value === 1) {
      pickTag(tagIdx.value)
      return true
    }
    open(pagePosts.value[gridFocus.index.value])
    return true
  }

  // ESC 归全局（开菜单）。只有跳页框这种局部临时状态才吃掉它
  if (a === 'cancel') {
    if (jumpOpen.value) {
      closeJump()
      return true
    }
    return false
  }
  return false
})
onUnmounted(off)

// ── 动作 ──

function pickGroup(i: number) {
  const o = groupOptions.value[i]
  if (!o) return
  playSfx('confirm')
  zone.value = 0
  gridFocus.set(0, true)
  scrollScreenTop()
  applyView(o.key, curTag.value)
}

function pickTag(i: number) {
  const o = tagOptions.value[i]
  if (!o) return
  playSfx('confirm')
  zone.value = 1
  gridFocus.set(0, true)
  scrollScreenTop()
  applyView(curGroup.value, o.key)
}

function clearFilter() {
  zone.value = 0
  gridFocus.set(0, true)
  applyView('', '')
}

function open(p?: PostListItem) {
  if (!p) return
  playSfx('confirm')
  goArticle(postKey(p), 'flash')
}

/** 鼠标：划过共享焦点（静音） */
function hoverCard(i: number) {
  zone.value = 2
  gridFocus.hover(i)
}
function clickCard(p: PostListItem, i: number) {
  hoverCard(i)
  open(p)
}
function hoverGroup(i: number) {
  zone.value = 0
  if (groupIdx.value !== i) groupIdx.value = i
}
function clickGroup(i: number) {
  hoverGroup(i)
  pickGroup(i)
}
function hoverTag(i: number) {
  zone.value = 1
  if (tagIdx.value !== i) tagIdx.value = i
}
function clickTag(i: number) {
  hoverTag(i)
  pickTag(i)
}

const activeFilterLabel = computed(() => {
  if (!curGroup.value && !curTag.value) return ''
  return curGroup.value ? `分组：${curGroup.value}` : `标签：${curTag.value}`
})

/** 页码显示用的区间 */
const rangeText = computed(() => {
  const total = filtered.value.length
  if (!total) return '0 / 0'
  const start = pageIndex.value * pageSize.value + 1
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

    <!-- 分组选择：一等公民，单独一行 -->
    <div class="frows">
      <div class="frow" data-testid="group-row">
        <span class="frow-cap px">分组</span>
        <button
          v-for="(o, i) in groupOptions"
          :key="o.key || 'all'"
          class="fchip focusable mini"
          :data-testid="`group-${o.key || 'all'}`"
          :class="{ on: curGroup === o.key, 'is-focused': zone === 0 && groupIdx === i }"
          @mouseenter="hoverGroup(i)"
          @click="clickGroup(i)"
        >
          {{ o.label }}<i class="fnum">{{ o.count }}</i>
        </button>
      </div>

      <!-- 标签行 -->
      <div class="frow" data-testid="tag-row">
        <span class="frow-cap px">标签</span>
        <button
          v-for="(o, i) in tagOptions"
          :key="o.key || 'all'"
          class="fchip focusable mini"
          :data-testid="`tag-${o.key || 'all'}`"
          :class="{ on: curTag === o.key, 'is-focused': zone === 1 && tagIdx === i }"
          @mouseenter="hoverTag(i)"
          @click="clickTag(i)"
        >
          {{ o.label }}<i class="fnum">{{ o.count }}</i>
        </button>
      </div>
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
        :class="{ 'is-focused': zone === 2 && gridFocus.index.value === i }"
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
        :disabled="pageIndex === 0"
        @click="turn(-1)"
      >
        ◀ 上一页 (PgUp)
      </button>

      <span class="dots">
        <i
          v-for="n in pageCount"
          :key="n"
          class="dot focusable mini"
          :class="{ on: n - 1 === pageIndex }"
          :data-testid="`page-dot-${n}`"
          @click="goPage(n - 1, n - 1 > pageIndex ? 1 : -1)"
        />
      </span>

      <span class="pcount">PAGE {{ pageIndex + 1 }} / {{ pageCount }}</span>

      <button
        class="pbtn focusable mini"
        data-testid="pager-next"
        :disabled="pageIndex >= pageCount - 1"
        @click="turn(1)"
      >
        下一页 (PgDn) ▶
      </button>

      <!-- 跳页：鼠标点开，键盘按 J（两条路径等价） -->
      <span v-if="jumpOpen" class="jump" :class="{ bump: bumping }">
        <label class="jump-cap px" for="jump-input">跳页</label>
        <input
          id="jump-input"
          ref="jumpEl"
          v-model="jumpValue"
          class="input jump-input"
          data-testid="jump-input"
          type="text"
          inputmode="numeric"
          spellcheck="false"
          @keydown.enter.prevent="submitJump"
        />
        <span class="jump-of px">/ {{ pageCount }}</span>
        <button class="pbtn focusable mini" data-testid="jump-go" @click="submitJump">跳转</button>
      </span>
      <button
        v-else
        class="pbtn focusable mini"
        data-testid="pager-jump"
        :disabled="pageCount < 2"
        @click="openJump"
      >
        跳页 (J)
      </button>

      <span class="keys hint">
        ↑↓←→ 按位置移动 · G 分组行 · T 标签行 · PgUp/PgDn 翻页 · J 跳页 · ENTER 打开 · P / ESC 菜单
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

/* 分组行 + 标签行：各自一行横向条，不换行（换行会把卡片挤出屏幕） */
.frows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.frow {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  padding-bottom: 3px;
}

.frow-cap {
  flex: 0 0 auto;
  color: var(--ink-faint);
  padding-right: 2px;
}

.fchip {
  font: inherit;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
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

/*
 * 「已选中」与「有焦点」同时成立时的样式：
 * 两条规则的权重相同，谁在后面谁赢 —— 不写这一条，把焦点移到当前选中的芯片上时
 * 屏幕毫无变化（选中色把焦点底色压掉了），键盘用户就不知道焦点在哪。
 * 做法与标签栏一致：底色从 blue-500 退一格到 blue-400，两侧光标照旧。
 */
.fchip.on.is-focused {
  background: var(--blue-400);
  border-color: var(--blue-500);
}

.fnum {
  font-style: normal;
  color: var(--blue-400);
}

.fchip.on .fnum {
  color: var(--blue-100);
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

/* 跳页输入条 */
.jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.jump-cap {
  color: var(--ink-faint);
}

.jump-input {
  width: 62px;
  text-align: center;
  font: inherit;
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--blue-500);
  padding: 4px 6px;
  font-variant-numeric: tabular-nums;
}

.jump-of {
  color: var(--ink-faint);
}

.keys {
  margin-left: auto;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .card-cover {
    flex: 0 0 200px;
  }

  .keys {
    display: none;
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
