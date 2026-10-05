<script setup lang="ts">
/**
 * LINKS 场景：关联链接
 *
 * 对应后端 GET /api/links/（存 external_links 表，默认无数据）。
 * 真接口返回空数组时也要有东西可看，因此数据层会退回内置样张（见 data/api.ts）。
 *   ↑ 这句是样机口径（样机的 data/api.ts 有 DEMO_LINKS）。生产版 §16.2 明确不迁样张，
 *     接口没命中就是空数组 → 由下面的空态渲染承接；lead 那一句文案也据此改了说法。
 *
 * 键盘：两列栅格按视觉相邻移动（与文章列表同一套 spatialIndex），ENTER 打开。
 * 站内路径（以 / 开头）走前端切换，绝对链接开新标签页。
 *
 * 迁移自样机 `design/icespark-prototype/src/scenes/LinksScene.vue`（架构 §16.1 映射表：
 * `scenes/LinksScene.vue` → `src/views/LinksView.vue`，路由 `/links`）。
 * 与样机的差异只有三处，其余逐字照搬：
 *   1. `usePad()` 不迁 —— 外壳的 `mountInput` 已经挂了唯一的键盘监听器，场景再挂一个
 *      就是同一次按键双触发（§16.3）；这里只保留 `onPad(handler)` 的 off 句柄并在
 *      `onUnmounted` 释放。
 *   2. 数据层由样机的裸 ref `store` 换成 pinia 的 `useContentStore()`，唯一的机械改写
 *      是去掉 `.value`（§16.2）。
 *   3. 两处文案口径（无样张 + 契约没有 `description`）—— 见模板里那两条注释。
 * 页面自己**不实现**页脚 / 状态行：站点小字与数据源在 `.deck`，由外壳渲染。
 */
import { computed, onMounted, onUnmounted } from 'vue'

import type { Link } from '@/api/types'
import ImageFrame from '@/frame/ImageFrame.vue'
import { spatialIndex, useFocusGroup } from '@/input/focus'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { coverOk, markCoverFailed } from '@/scene/cover'
import { scrollScreenTop } from '@/scene/screen'
import { focusTabs, switchTab, TAB_IDS } from '@/scene/tabs'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const { clock, stop } = useStatusBar()

const COLS = 2
/**
 * 样机是 `store.links.value`（裸 ref）；pinia 实例上 `content.links` 就是数组 ——
 * §16.2 的唯一机械改写：去掉 `.value`，其余访问形状不变。
 */
const links = computed(() => content.links)
const gridFocus = useFocusGroup()

/**
 * 有没有封面（用户：关联页的链接要能配封面图）。
 *
 * 判断与失败缓存跟文章列表 / 首页 / 文章页共用 `scene/cover.ts`：
 * `coverOk` 会记住那些加载失败的地址 —— 坏图只试一次，之后就当没有封面，
 * 卡片直接回到"纯文字"那版版式，而不是反复请求再闪一块空画框。
 */
function hasCover(l: Link): boolean {
  return coverOk(l.cover_image)
}

onMounted(() => {
  scrollScreenTop()
  void content.loadLinks()
})
onUnmounted(stop)

const off = onPad((a) => {
  const n = links.value.length
  if (a === 'confirm') {
    open(links.value[gridFocus.index.value])
    return true
  }
  // 不吃 ESC（理由同 AboutView 同处注释）：ESC 归外壳的菜单，标签栏用原生 TAB 切
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
      <span :class="content.dataSource">{{
        content.dataSource === 'live' ? '● LIVE' : '○ DEMO'
      }}</span>
    </SceneHead>

    <!-- 样机这一句说的是「返回空时展示的是内置样张」；正式版 §16.2 明确不迁 DEMO_LINKS，
         接口没命中时这里就是空的，故只改这一句说法，其余文案一字不动 -->
    <p class="lead px">
      站外入口与站内服务挂载点。接口 <b>GET /api/links/</b> 没有配置时这里是空的。
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
        <!-- 有封面：左图右文（与文章列表卡片同一版式语言；没有封面就不留空图片位） -->
        <span v-if="hasCover(l)" class="card-cover">
          <ImageFrame
            :src="l.cover_image"
            :alt="l.name"
            ratio="3 / 2"
            @error="markCoverFailed(l.cover_image)"
          />
        </span>
        <span class="card-main">
          <span class="card-name">{{ l.name }}</span>
          <!-- 契约的 ExternalLink 没有 description 字段（样机自造的字段），
               所以恒定落到样机的兜底文案；后端补字段后这里改回 `l.description || '（没有说明）'` -->
          <span class="card-desc read">（没有说明）</span>
          <span class="card-url px">{{ l.url }}</span>
        </span>
        <span class="card-go px">↗</span>
      </a>
    </div>

    <div class="foot sticky-foot px hint">
      ↑↓←→ 按位置移动 · ENTER / 点击打开 · TAB 切页 · P / ESC 菜单 ·
      站内路径在前端切换，绝对链接开新页
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
  /* 行高按内容走（与文章列表同一条口径，见 `PostListView.vue` 的 `.grid` 注释）。
     样机写的是 `flex: 1` + `minmax(120px, 1fr)`：行高会被拉到可用高度 —— 条目少的时候
     两三张卡就摊成 550px 高的大白框（配上封面更明显：200px 的图浮在五百多像素的框里）。
     样机自己是 3 条示例链接、两行分摊，看不出这个毛病。 */
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: max-content;
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

.card-cover {
  /* 定宽在中等宽度上会出事：两列时一格只有 400 出头，240 的图 + 40 的名牌 + 间隔
     把文字列挤成一条缝，卡片被顶到 320 高（实测 900 宽下就是这样）。
     所以改成「按宽度取 38%、上限 260px」：宽屏约 215px（比文章卡片 320 窄一档，
     链接卡只有名字与地址两行字），窄屏跟着缩，再宽也不会变成一块大图。 */
  flex: 0 1 38%;
  min-width: 0;
  max-width: 260px;
  /* 画框自己保持 3:2，不跟着文字列拉伸 */
  align-self: flex-start;
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
    /* `minmax(0, 1fr)` 而不是 `1fr`：后者等于 `minmax(auto, 1fr)`，列宽会被条目的
       **最小内容宽**顶开 —— 一条长地址就能把单列撑出 25px 横向滚动（实测 420 宽）。
       宽屏那一条本来就写的是 `minmax(0, 1fr)`，这里与它对齐。 */
    grid-template-columns: minmax(0, 1fr);
  }

  .card-cover {
    /* 单列了：固定 120 比 38% 更稳（38% 在宽屏单列上会又变回一块大图） */
    flex: 0 0 120px;
    max-width: none;
  }
}
</style>
