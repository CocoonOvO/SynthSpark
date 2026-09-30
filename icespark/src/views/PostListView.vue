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
 *
 * ── 迁移自样机 `scenes/ArticleListScene.vue`（架构 §16），机械改写清单 ──
 * · 数据层：`data/api` 的裸 ref `store` → `stores/content` 的 pinia 实例，
 *   `store.x.value` → `store.x`（pinia 自动解包，没有 `.value`）；
 *   加载动作从 `loadPosts(...)` 这样的模块函数变成 store 的同名 action。
 *   唯一两处不是纯形状改写的地方都写了注释：`p.tags?.` 与 `AVATAR_PALETTE`。
 * · 输入层：**`usePad()` 不迁** —— 外壳已挂唯一的键盘监听器（`@/input` 的 `mountInput`），
 *   场景再挂一个就是双触发；场景一律用 `onPad(handler)`，返回的 off 句柄在 `onUnmounted` 释放。
 *   同样不迁 `useFocusList` / 全局 `focusIndex` / `playFocusMove`（§16.3）：
 *   生产版的共享焦点模型是 `useFocusGroup()` + `spatialIndex()`，音效一律 `playSfx('move')`。
 * · 其余 import 只是按 §16.1 映射表换目录。
 * · 模板结构 / 类名 / scoped 样式 / testid / 文案 / 间距字号**一字未改**。
 * · 样机的 `?demo=1` 开关不迁（§16.2：正式版没有样张），
 *   但 `goPosts` 里「保留不归列表管的 query 参数」这条机制照旧生效。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onPad } from '@/input/pad'
import { useStatusBar } from '@/scene/clock'
import { scrollScreenTop } from '@/scene/screen'
import { focusTabs } from '@/scene/tabs'
import { goPosts, goArticle } from '@/scene/nav'
import { useFocusGroup, spatialIndex } from '@/input/focus'
import { playSfx } from '@/input/sfx'
import { pageSize, motionEnabled } from '@/config/prefs'
import { useContentStore } from '@/stores/content'
import { shortDate, postKey } from '@/api/format'
import type { PostListItem } from '@/api/types'
import PixelAvatar from '@/signal/PixelAvatar.vue'
import ImageFrame from '@/frame/ImageFrame.vue'
import { coverOk, markCoverFailed, stampParts } from '@/scene/cover'
import SceneHead from '@/machine/SceneHead.vue'
import { ACTIVE_PALETTE, PALETTES, avatarPalette } from '@/styles/tokens'

/**
 * 样机是 `styles/tokens.ts` 里写死的 `AVATAR_PALETTE` 数组；
 * 生产版按 §16.1 改成按当前配色方案现算（加主题时组件一行都不用改）。
 */
const AVATAR_PALETTE = avatarPalette(PALETTES[ACTIVE_PALETTE])

const { clock, stop } = useStatusBar()
const route = useRoute()
const content = useContentStore()

const COLS = 2

/** 封面状态与日期戳见 scene/cover.ts（列表 / 首页 / 文章页共用同一套判断） */
function hasCover(p: { cover_image?: string | null }) {
  return coverOk(p.cover_image)
}

onMounted(() => {
  scrollScreenTop()
  void content.loadPosts(60)
  void content.loadGroups()
  void content.loadTags()
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
  content.posts.filter((p) => {
    if (curGroup.value && p.group_name !== curGroup.value) return false
    // 契约里 `tags` 是可选字段（样机把它写成必填）：没有标签数组，就等价于「不含这个标签」
    if (curTag.value && !p.tags?.includes(curTag.value)) return false
    return true
  }),
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
  { key: '', label: '全部分组', count: content.posts.length },
  ...content.groups.map((g) => ({ key: g.name, label: g.name, count: g.post_count })),
])

const tagOptions = computed(() => [
  { key: '', label: '全部标签', count: content.posts.length },
  ...content.tags.map((t) => ({ key: t.name, label: `#${t.name}`, count: t.post_count })),
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
  { immediate: true },
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

/**
 * 关跳页框。
 *
 * 输入框是它自己持有原生焦点的，`jumpOpen = false` 会把这个节点卸载掉 —— 焦点会掉回 `body`，
 * 键盘当场失灵（真 bug：跳页回车之后 PgDn / P / J 全没反应，得先用鼠标点一下）。
 * 这里不再自己补 `focusShellRoot()`：输入层现在有统一的兜底（`input/index.ts` 的
 * `onFocusOut`：**持有焦点的节点被卸载**且焦点空在 body 上时收回外壳），
 * 点「✕ 清除」把按钮自己筛掉那一处也一并治了。
 *
 * `@keydown.esc.stop` 是另一件事：内核把「编辑框里的 ESC」定义成「先失焦」（2026-09-30 用户裁定），
 * 若不 `.stop`，这一下会被内核吃掉、`closeJump()` 永远收不到 —— 样机冻结的口径是
 * **按一下 ESC 就关框**（`round5.mjs` 的「跳页框 ESC 只关框不开菜单」）。
 * 一个临时小框不该套用「正文编辑器」的失焦语义，所以照 `TextEditorDialog` 的先例走局部规则。
 */
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

/**
 * 筛选条是单行横向滚动（换取「绝不多占一行高度」）。
 * 代价是超出的芯片要靠横向滚动才够得到，所以把滚轮借过来：
 * 在筛选条上滚轮 = 横向滚这一条；这一条没得滚时立刻放手，让页面正常纵向滚动。
 */
function onRowWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth) return
  const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
  if (!d) return
  e.preventDefault()
  el.scrollLeft += d
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
      <div class="frow" data-testid="group-row" @wheel="onRowWheel">
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
      <div class="frow" data-testid="tag-row" @wheel="onRowWheel">
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
    <div v-if="content.dataSource === 'loading' && !content.posts.length" class="state px">
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
        :class="{
          'is-focused': zone === 2 && gridFocus.index.value === i,
          'is-text': !hasCover(p),
        }"
        @mouseenter="hoverCard(i)"
        @click="clickCard(p, i)"
      >
        <!-- 有封面：左图右文（封面区尺寸固定，混排时行高一致） -->
        <div v-if="hasCover(p)" class="card-cover">
          <ImageFrame
            :src="p.cover_image"
            :alt="p.title"
            ratio="3 / 2"
            @error="markCoverFailed(p.cover_image)"
          />
        </div>

        <div class="card-body">
          <span v-if="!hasCover(p)" class="card-group px">
            <i class="group-mark">▌</i>{{ p.group_name || '未分组' }}
          </span>

          <div class="card-text">
            <h3 class="card-title">{{ p.title }}</h3>
            <p class="card-intro read">{{ p.introduction || '（暂无简介）' }}</p>
          </div>

          <!-- 无封面：不摆空图片位，改在右侧立一列「数据脊」——
               日期在上、阅读与点赞在下，撑满整张卡的高度，
               正文栏也因此收窄、字号放大，卡片不会显得空
               （用户第七轮第 1 条：无封面要换布局，不能空旷） -->
          <div v-if="!hasCover(p)" class="card-side px">
            <span class="side-date">
              <i class="side-ym"
                >{{ stampParts(p.created_at).m }} / {{ stampParts(p.created_at).y }}</i
              >
              <!-- 日号是这张卡的图形：像素字体只在 12 的倍数下锐利，所以走 px-48 档位 -->
              <b class="side-day px-48 px-display">{{ stampParts(p.created_at).d }}</b>
            </span>
            <span class="side-rule" />
            <span class="side-stats">
              <i class="side-stat num">◉ {{ p.view_count }}</i>
              <i class="side-stat num">♥ {{ p.like_count }}</i>
            </span>
          </div>

          <div class="card-foot px">
            <PixelAvatar
              :src="p.author_avatar"
              :name="p.author_name"
              :size="16"
              :display="24"
              :palette="AVATAR_PALETTE"
            />
            <span class="author">{{ p.author_name }}</span>
            <!-- 文字卡把日期 / 阅读 / 点赞挪进了左侧日期戳，页脚不重复摆一遍 -->
            <template v-if="hasCover(p)">
              <span class="faint">{{ shortDate(p.created_at) }}</span>
              <span class="faint num">◉ {{ p.view_count }}</span>
              <span class="faint num">♥ {{ p.like_count }}</span>
            </template>
            <span v-if="p.group_name" class="tag">{{ p.group_name }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- 翻页条 -->
    <div class="foot sticky-foot px">
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
          @keydown.esc.stop="closeJump"
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
  /* 不伸缩、也不收缩：卡片按内容排，多出来的高度留给 .foot 的 margin-top:auto（翻页条贴底）。
     早先写的是 flex:1 + min-height:0 —— 内容比可用高度高时，栅格盒子会**比内容矮**，
     超出的卡片会画到翻页条上面去（窄屏 + 长标题就能复现）。 */
  flex: 0 0 auto;
  display: grid;
  /* 两列不变（用户要求），但卡片改成横向：1440 下一格宽 640+，
     竖排卡片会把封面撑到 360px 高，两行直接吃掉整屏 —— 横排才是这个宽度该有的形态 */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 行高按内容走：卡片被拉伸到整行高的话，卡片里会留一大块空白，很难看。
     必须是 max-content 而不是 auto —— auto 轨道在「内容装不下栅格高度」时会被压缩，
     卡片内容随之被 overflow:hidden 切掉（第七轮：窄屏 + 长标题就撞上了）。
     max-content 不会被压缩，装不下就让整页滚。 */
  grid-auto-rows: max-content;
  gap: 12px;
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

/* 封面区尺寸固定：有封面卡片之间混排时高度完全一致（用户反馈第 6 条） */
.card-cover {
  flex: 0 0 320px;
  min-width: 0;
  /* 画框自己保持 3:2，不跟着文字列拉伸 */
  align-self: flex-start;
}

/* ── 无封面卡片：换一套版式（用户第七轮第 1 条）──
   不摆空的图片位，也不在卡片里留洞：正文栏收窄、标题放大，
   右侧立一列「数据脊」（日期在上、阅读与点赞在下，上下两簇撑满整列）。
   整张卡的分量因此从「中间一块图」挪到「左边文字 + 右边数字」。 */
.card.is-text .card-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'group side'
    'text  side'
    'foot  foot';
  gap: 6px 18px;
  padding-left: 16px;
}

.card.is-text .card-group {
  grid-area: group;
}

.card.is-text .card-text {
  grid-area: text;
  justify-content: center;
}

.card-side {
  grid-area: side;
  min-width: 96px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  /* 上簇（日期）与下簇（计数）分居两端：这一列自己不空 */
  justify-content: space-between;
  padding-left: 14px;
  /* 左侧一道竖色带：档案卡的语言，没有图也立得住 */
  border-left: 4px solid var(--blue-300);
}

.card.is-text .card-foot {
  grid-area: foot;
}

.side-date {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.side-day {
  font-weight: 400;
  color: var(--blue-500);
}

.side-ym {
  font-style: normal;
  color: var(--ink-soft);
}

.side-rule {
  width: 74%;
  height: 3px;
  background: var(--blue-200);
}

.side-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.side-stat {
  font-family: 'ArkPixel', 'Noto Sans Mono', monospace;
  font-style: normal;
  font-size: 12px;
  color: var(--ink-soft);
}

.card-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* 文字卡的正文区：三段式（分组名 / 正文 / 页脚），正文块在中间垂直居中，
   这样简介只有两行时也不会在卡片下半截留一个洞 */
.card.is-text .card-body {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  padding-left: 14px;
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
}

.card.is-text .card-text {
  justify-content: center;
  gap: 8px;
}

.card-group {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--blue-600);
}

.group-mark {
  color: var(--blue-400);
  font-style: normal;
}

.card-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.4;
  margin: 0;
  /* 标题**不截断**（用户第七轮反馈：标题被吃掉比卡片高一点更糟）。
     只给最矮两行的占位，标题写长了就让卡片按需要长高 —— 同一行由栅格拉伸对齐，
     所以「卡片会长高」这件事不会把栅格弄乱，只是那一行整体变高。 */
  min-height: 2.8em;
  display: block;
  /* 万一标题里是一长串没有空格的字符（URL 之类），也要在框内换行而不是横着溢出去 */
  overflow-wrap: break-word;
}

/* 文字卡没有封面分担视线，标题可以更大、可以占三行 */
.card.is-text .card-title {
  font-size: 24px;
  min-height: 0;
  /* 关键：标题不参与收缩。容器不够高时宁可把卡片顶高，也不能把字切掉 */
  flex: 0 0 auto;
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

/* 文字卡的正文栏比有封面的窄（右列让给了数据脊），字号略大、多给几行 */
.card.is-text .card-intro {
  font-size: 14px;
  min-height: 0;
  -webkit-line-clamp: 5;
  /* 空间不够时收缩的是摘要（line-clamp 会补省略号，是有意的截断），不是标题 */
  flex: 0 1 auto;
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
