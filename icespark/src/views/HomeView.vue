<script setup lang="ts">
/**
 * HOME 场景：主页
 *
 * 取代上一版的「游戏主菜单」。主页要回答三个问题：
 *   这个站在写什么（最新文章）· 内容怎么分组（分组 / 标签）· 站还活着吗（统计 + 数据来源）
 *
 * 键盘模型（三段式，不是一锅乱的线性列表）：
 *   段内 ←→ 走同伴，段间 ↑↓ 跨段，第一段首项再按 ↑ 把焦点交给顶部标签栏
 * 鼠标：划过共享焦点（静音），点击直接执行，与键盘完全等价。
 *
 * 迁移自样机 `design/icespark-prototype/src/scenes/HomeScene.vue`（架构 §16.1 映射表）。
 * 机械改写只有两类：import 换成生产路径（`onPad` 走 `@/input/pad`，样机开头的 `usePad()`
 * 删掉 —— 外壳已挂唯一键盘监听器，再挂一个就是双触发）；数据换成 pinia 的
 * `useContentStore()`（`store.x.value` → `content.x`，pinia 会解包 ref）。
 * 按 §16.2 删掉一处：统计条文案里 `forceDemo ? '样张数据源（?demo=1 强制）'` 那一支不迁
 * （正式版没有样张、也没有 `?demo=1` 开关），只留样机另外两句原文。
 *
 * **站点文案一律不写死**（架构 §13 硬要求 2，映射表见 §18.2）：英雄区大字与那句副文、
 * 统计条三个标签、三段段标题、「查看全部」与「全部文章」卡片的文字都读 `useSiteStore()`
 * 的三级配置。样机里写在模板上的字面值已经搬进 `config/defaults.ts` 当第一级默认值，
 * 因此默认渲染仍与样机逐字一致。
 * 留在模板里的中文只剩两类：**8bit 机器字样**（`LATEST` / `GROUPS` / `TAGS`、`TAB 切页` 那行
 * 操作提示）与**运行期读数 / 空值占位**（`N 个分组`、`按使用次数排序`、`未分组`、
 * `（暂无简介）`、`N 阅读`）—— 它们是皮肤与数据事实，不是站点文案。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { shortDate, shortNum, postKey } from '@/api/format'
import type { PostListItem } from '@/api/types'
import ImageFrame from '@/frame/ImageFrame.vue'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { coverOk, markCoverFailed, stampParts } from '@/scene/cover'
import { goPosts, goArticle } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import { focusTabs } from '@/scene/tabs'
import { useContentStore } from '@/stores/content'
import { useSiteStore } from '@/stores/site'

const content = useContentStore()
const site = useSiteStore()
const { clock, stop } = useStatusBar()

onMounted(() => {
  scrollScreenTop()
  void content.loadPosts(12)
  void content.loadGroups()
  void content.loadTags()
  void content.loadStats()
})
onUnmounted(stop)

/** 无封面的文章换版式（第七轮第 1 条），判断口径与列表 / 文章页一致 */
function hasCover(p: PostListItem) {
  return coverOk(p.cover_image)
}

const latest = computed(() => content.posts.slice(0, 3))
const groups = computed(() => content.groups)
const tags = computed(() => content.tags.slice(0, 10))

/** 三段：最新文章（末项是「查看全部」） / 分组 / 标签 */
const counts = computed(() => [latest.value.length + 1, groups.value.length, tags.value.length])
const zone = ref(0)
const idx = ref(0)

/** 当前项是否命中某个具体目标 */
function isAt(z: number, i: number) {
  return zone.value === z && idx.value === i
}

function moveTo(z: number, i: number) {
  zone.value = z
  idx.value = i
  playSfx('move')
}

const off = onPad((a) => {
  const n = counts.value.length
  const c = counts.value[zone.value] ?? 0
  if (a === 'up') {
    if (idx.value > 0) {
      moveTo(zone.value, idx.value - 1)
      return true
    }
    if (zone.value > 0) {
      moveTo(zone.value - 1, Math.max(0, (counts.value[zone.value - 1] ?? 1) - 1))
      return true
    }
    // 首段首项再往上：焦点交给顶部标签栏（键盘必须能到达标签栏）
    focusTabs()
    return true
  }
  if (a === 'down') {
    if (idx.value < c - 1) {
      moveTo(zone.value, idx.value + 1)
      return true
    }
    if (zone.value < n - 1) {
      moveTo(zone.value + 1, 0)
      return true
    }
    return false
  }
  if (a === 'left' || a === 'right') {
    const next = idx.value + (a === 'left' ? -1 : 1)
    if (next < 0 || next >= c) return false
    moveTo(zone.value, next)
    return true
  }
  if (a === 'confirm') {
    activate()
    return true
  }
  return false
})
onUnmounted(off)

function activate() {
  if (zone.value === 0) {
    const p = latest.value[idx.value]
    if (!p) {
      // 「查看全部」：切到文章标签页（不带筛选）
      clickAll()
      return
    }
    openPost(p)
    return
  }
  if (zone.value === 1) {
    const g = groups.value[idx.value]
    if (!g) return
    openGroup(g.name)
    return
  }
  const t = tags.value[idx.value]
  if (!t) return
  openTag(t.name)
}

/** 分组 / 标签都跳文章列表：筛选条件写进 URL，因此可分享、可后退 */
function openGroup(name: string) {
  playSfx('confirm')
  goPosts({ group: name })
}

function openTag(name: string) {
  playSfx('confirm')
  goPosts({ tag: name })
}

function openPost(p: PostListItem) {
  playSfx('confirm')
  goArticle(postKey(p), 'flash')
}

/** 鼠标路径 */
function hoverPost(i: number) {
  if (isAt(0, i)) return
  zone.value = 0
  idx.value = i
}
function clickPost(p: PostListItem, i: number) {
  hoverPost(i)
  openPost(p)
}
function clickAll() {
  zone.value = 0
  idx.value = latest.value.length
  goPosts()
}
function clickGroup(i: number) {
  zone.value = 1
  idx.value = i
  activate()
}
function clickTag(i: number) {
  zone.value = 2
  idx.value = i
  activate()
}

const stats = computed(() => content.stats)
</script>

<template>
  <div class="home">
    <SceneHead title="主页 · HOME" :clock="clock">
      <span class="src" :class="content.dataSource">{{
        content.dataSource === 'live' ? '● LIVE' : '○ DEMO'
      }}</span>
    </SceneHead>

    <div class="hero">
      <div class="hero-name px px-48 px-display">{{ site.config.home.title }}</div>
      <p class="hero-sub">{{ site.config.home.desc }}</p>
      <div class="hero-stats px">
        <span class="stat"
          ><b>{{ shortNum(stats.post_count) }}</b
          ><i>{{ site.config.home.stats.articles }}</i></span
        >
        <span class="stat"
          ><b>{{ shortNum(stats.agent_count) }}</b
          ><i>{{ site.config.home.stats.creators }}</i></span
        >
        <span class="stat"
          ><b>{{ shortNum(stats.total_views) }}</b
          ><i>{{ site.config.home.stats.reads }}</i></span
        >
        <!-- 样机的 `forceDemo ? '样张数据源（?demo=1 强制）'` 一支按 §16.2 不迁
             （正式版没有样张，也没有 ?demo=1 开关），留下的是样机另外两句原文。
             后一句按生产语义改了词：样机说「回退内置样张」，而正式版没有样张
             （dataSource 的 demo = 接口没命中，页面按空数据渲染），照抄会是一句假话 -->
        <span class="stat-src hint">
          {{ content.dataSource === 'live' ? '接口 /api 实时数据' : '后端不可达，暂无数据' }}
        </span>
      </div>
    </div>

    <!-- 段①：最新文章 -->
    <section class="sec">
      <div class="sec-cap px">
        <span class="cap-en">LATEST</span>
        <span class="cap-cn">{{ site.config.home.articles.title }}</span>
        <button class="cap-more focusable mini" data-testid="home-all" @click="clickAll">
          {{ site.config.home.articles.viewAll }}
        </button>
      </div>

      <div class="posts">
        <article
          v-for="(p, i) in latest"
          :key="p.id"
          class="post focusable"
          :data-testid="`home-post-${i}`"
          :class="{ 'is-focused': isAt(0, i), 'is-text': !hasCover(p) }"
          @mouseenter="hoverPost(i)"
          @click="clickPost(p, i)"
        >
          <!-- 有封面：图在上、文在下 -->
          <div v-if="hasCover(p)" class="post-thumb">
            <ImageFrame
              :src="p.cover_image"
              :alt="p.title"
              ratio="21 / 9"
              @error="markCoverFailed(p.cover_image)"
            />
          </div>

          <!-- 无封面：不摆空图片位，改在卡片顶部横一条「分组 / 日期」头，
               标题与正文因此拿到整张卡的高度（正文 flex 撑开、行数放宽），
               卡片被拉满而不是上半张图空着 -->
          <div v-else class="post-head px">
            <span class="head-group">{{ p.group_name || '未分组' }}</span>
            <span class="head-date num">
              {{ stampParts(p.created_at).y }}.{{ stampParts(p.created_at).m }}.{{
                stampParts(p.created_at).d
              }}
            </span>
          </div>

          <div class="post-main">
            <h3 class="post-title">{{ p.title }}</h3>
            <p class="post-intro read">{{ p.introduction || '（暂无简介）' }}</p>
            <div class="post-meta px">
              <span>{{ p.author_name }}</span>
              <!-- 文字卡的日期已经在顶部头里，页脚不重复摆 -->
              <template v-if="hasCover(p)">
                <span class="dot">·</span>
                <span>{{ shortDate(p.created_at) }}</span>
              </template>
              <span class="dot">·</span>
              <span>{{ p.view_count }} 阅读</span>
              <span v-if="p.group_name && hasCover(p)" class="tag">{{ p.group_name }}</span>
            </div>
          </div>
        </article>

        <button
          class="post all focusable"
          :class="{ 'is-focused': isAt(0, latest.length) }"
          @mouseenter="hoverPost(latest.length)"
          @click="clickAll"
        >
          <span class="all-mark">▤</span>
          <span class="all-text px"
            >{{ site.config.home.allCard.title }}<br /><i class="hint">{{
              site.config.home.allCard.hint
            }}</i></span
          >
        </button>
      </div>
    </section>

    <!-- 段②：分组集合 -->
    <section class="sec">
      <div class="sec-cap px">
        <span class="cap-en">GROUPS</span>
        <span class="cap-cn">{{ site.config.home.groups.title }}</span>
        <span class="cap-note hint">{{ groups.length }} 个分组</span>
      </div>
      <div class="chips">
        <button
          v-for="(g, i) in groups"
          :key="g.id"
          class="chip focusable"
          :data-testid="`home-group-${i}`"
          :class="{ 'is-focused': isAt(1, i) }"
          @mouseenter="((zone = 1), (idx = i))"
          @click="clickGroup(i)"
        >
          <b class="chip-name">{{ g.name }}</b>
          <span class="chip-count">{{ g.post_count }}</span>
          <span v-if="g.description" class="chip-desc hint">{{ g.description }}</span>
        </button>
      </div>
    </section>

    <!-- 段③：标签集合 -->
    <section class="sec">
      <div class="sec-cap px">
        <span class="cap-en">TAGS</span>
        <span class="cap-cn">{{ site.config.home.tags.title }}</span>
        <span class="cap-note hint">按使用次数排序</span>
      </div>
      <div class="chips">
        <button
          v-for="(t, i) in tags"
          :key="t.id"
          class="chip tag-chip focusable"
          :data-testid="`home-tag-${i}`"
          :class="{ 'is-focused': isAt(2, i) }"
          @mouseenter="((zone = 2), (idx = i))"
          @click="clickTag(i)"
        >
          <b class="chip-name">{{ t.name }}</b>
          <span class="chip-count">{{ t.post_count }}</span>
        </button>
      </div>
    </section>

    <div class="home-foot sticky-foot px hint">
      ↑↓ 跨段 · ←→ 段内 · ENTER 打开 · ↑ 到顶后可上标签栏 · TAB 切页 · P / ESC 打开菜单
    </div>
  </div>
</template>

<style scoped>
.home {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 26px 14px;
  gap: 14px;
}

.src.live {
  color: var(--blue-600);
}

.hero {
  border-bottom: 3px solid var(--blue-200);
  padding-bottom: 14px;
}

.hero-name {
  color: var(--blue-500);
}

.hero-sub {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 14.5px;
  line-height: 1.9;
  color: var(--ink-soft);
  margin: 8px 0 12px;
}

.hero-stats {
  display: flex;
  align-items: baseline;
  gap: 22px;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat b {
  font-weight: 400;
  font-size: 24px;
  color: var(--blue-600);
  font-variant-numeric: tabular-nums;
}

.stat i {
  font-style: normal;
  color: var(--ink-faint);
}

.stat-src {
  margin-left: auto;
}

.sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sec-cap {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 2px solid var(--blue-200);
  padding-bottom: 6px;
}

.cap-en {
  color: var(--blue-500);
}

.cap-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 14px;
}

.cap-note,
.cap-more {
  margin-left: auto;
}

.cap-more {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

.posts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.post {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 10px;
  cursor: pointer;
}

.post-thumb {
  flex: 0 0 auto;
}

/* 无封面版式的顶部头：分组在左、日期在右，下面压一条细线，
   和页面里其它「标题行」用同一套语言 */
.post-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 2px solid var(--blue-200);
  padding-bottom: 6px;
}

.head-group {
  color: var(--blue-700);
}

.head-date {
  margin-left: auto;
  color: var(--ink-faint);
}

/* 文字卡没有缩略图，正文把剩下的高度整个吃掉，卡片不会上紧下空 */
.post.is-text .post-main {
  flex: 1;
}

.post.is-text .post-title {
  font-size: 18px;
  min-height: 0;
  /* 同上：宁可卡片长高，也不切字 */
  flex: 0 0 auto;
}

.post.is-text .post-intro {
  /* 收缩的是摘要：line-clamp 会补省略号，是有意的截断 */
  flex: 0 1 auto;
  font-size: 13px;
  -webkit-line-clamp: 6;
}

.post-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.post-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.45;
  margin: 0;
  /* 标题不截断（用户第七轮反馈）：标题长了卡片就长高，一行三张靠栅格拉伸齐平 */
  min-height: 2.9em;
  display: block;
  overflow-wrap: break-word;
}

.post-intro {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
  color: var(--ink-faint);
  font-size: 12px;
}

.post-meta .dot {
  color: var(--blue-300);
}

.tag {
  border: 1.5px solid var(--blue-400);
  padding: 0 5px;
  color: var(--blue-700);
}

.post.all {
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--blue-100);
  border-style: dashed;
}

.all-mark {
  font-size: 24px;
  color: var(--blue-500);
}

.all-text {
  text-align: center;
  line-height: 1.8;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--ink);
  padding: 5px 10px;
  cursor: pointer;
}

.chip-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 13px;
}

.chip-count {
  color: var(--blue-500);
}

.chip-desc {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 11.5px;
}

.tag-chip .chip-name {
  font-weight: 400;
}

.home-foot {
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 1080px) {
  .posts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .posts {
    grid-template-columns: 1fr;
  }
}
</style>
