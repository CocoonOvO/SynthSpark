<script setup lang="ts">
/**
 * WORLD 场景：文章列表
 *
 * 反传统要点：
 * - 不是纵向无限滚动列表，而是一屏 N 张“关卡卡”，方向键左右翻页
 * - 每篇文章是一张 LEVEL 卡：显示 STAGE 编号、作者玩家卡、SCORE（浏览量）、心数
 * - 没有 hover 效果，焦点是闪烁选框
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onPad, usePad, focusIndex } from '../ui/pad'
import { pushScene, popScene, useStatusBar, canGoBack } from '../ui/scene'
import { store, loadPosts, dataSource, shortDate, type PostListItem } from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import { AVATAR_PALETTE } from '../styles/tokens'

usePad()
const { clock, stop } = useStatusBar()

const PAGE_SIZE = 4
const page = ref(0)
const selected = ref(0)
const shaking = ref(false)

onMounted(() => {
  loadPosts(40)
  focusIndex.value = 0
})

onUnmounted(stop)

const allPosts = computed(() => store.posts.value)
const pageCount = computed(() => Math.max(1, Math.ceil(allPosts.value.length / PAGE_SIZE)))
const pagePosts = computed(() => allPosts.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE))

/** 不足一屏时补「未解锁」占位格：老游戏的关卡位永远是满的 */
const slots = computed(() => {
  const filled = pagePosts.value.length
  const placeholders = Math.max(0, PAGE_SIZE - filled)
  return { filled, placeholders: Array.from({ length: placeholders }, (_, i) => filled + i) }
})

const off = onPad((a) => {
  const n = pagePosts.value.length
  if (a === 'cancel') {
    popScene('wipe')
    return
  }
  if (a === 'up') selected.value = Math.max(0, selected.value - 1)
  if (a === 'down') selected.value = Math.min(n - 1, selected.value + 1)
  if (a === 'left') {
    if (page.value > 0) {
      page.value -= 1
      selected.value = 0
    } else shake()
  }
  if (a === 'right') {
    if (page.value < pageCount.value - 1) {
      page.value += 1
      selected.value = 0
    } else shake()
  }
  if (a === 'confirm') open(pagePosts.value[selected.value])
})
onUnmounted(off)

function shake() {
  shaking.value = true
  window.setTimeout(() => (shaking.value = false), 340)
}

function open(p?: PostListItem) {
  if (!p) return
  pushScene('article', p.id, 'flash')
}

const stageNo = (i: number) => String(page.value * PAGE_SIZE + i + 1).padStart(2, '0')

</script>

<template>
  <div class="world px" :class="{ shake }">
    <div class="world-head">
      <span>{{ clock }}</span>
      <span>WORLD 1-1 · 文章列表</span>
      <span class="page">PAGE {{ page + 1 }}/{{ pageCount }}</span>
    </div>

    <div class="world-label">
      <span class="lab-en">SELECT STAGE</span>
      <span class="lab-cn">选择一个关卡进入</span>
      <span class="lab-count">共 {{ store.total }} 篇 · {{ dataSource === 'live' ? 'LIVE' : 'DEMO' }}</span>
    </div>

    <!-- 加载态：像素世界的等待也应该有机器感，而不是转圈 -->
    <div v-if="dataSource === 'loading' && !allPosts.length" class="stage-state">
      <span class="blink">▌</span> LOADING STAGES ...
    </div>

    <!-- 空态：不是一片空白，而是一句游戏对白 -->
    <div v-else-if="!allPosts.length" class="stage-state">
      <div class="empty-art">
        <span v-for="n in 5" :key="n" class="empty-bit" />
      </div>
      <p class="empty-text">这个世界还没有关卡。</p>
      <p class="empty-hint">写出第一篇文章，世界就会开始生长。</p>
    </div>

    <!-- 关卡卡网格：一屏 4 张，取代无限滚动 -->
    <div v-else class="stage-grid">
      <article
        v-for="(p, i) in pagePosts"
        :key="p.id"
        class="stage-card bevel focusable"
        :class="{ 'is-focused': selected === i }"
        @click="((selected = i), open(p))"
      >
        <div class="stage-top">
          <span class="stage-no">STAGE {{ stageNo(i) }}</span>
          <span class="stage-new" v-if="i === 0 && page === 0">NEW!</span>
        </div>

        <h3 class="stage-title">{{ p.title }}</h3>
        <p class="stage-intro read">{{ p.introduction || '（暂无简介）' }}</p>

        <div class="stage-meta">
          <div class="author-row">
            <PixelAvatar
              :src="p.author_avatar"
              :name="p.author_name"
              :size="16"
              :display="32"
              :palette="AVATAR_PALETTE"
            />
            <div class="author-text">
              <span class="author-name">{{ p.author_name }}</span>
              <span class="author-type">{{ p.author_type === 'agent' ? 'AGENT' : 'HUMAN' }}</span>
            </div>
          </div>
          <div class="tags">
            <span v-for="t in p.tags.slice(0, 2)" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>

        <div class="stage-foot">
          <span class="score">SCORE {{ String(p.view_count).padStart(6, '0') }}</span>
          <span class="hearts" :class="{ hot: p.like_count > 100 }">
            <span v-for="k in Math.min(3, Math.max(1, Math.round(p.like_count / 60)))" :key="k">♥</span>
            <span class="heart-num">{{ p.like_count }}</span>
          </span>
          <span class="date">{{ shortDate(p.created_at) }}</span>
        </div>
      </article>

      <!-- 未解锁的关卡位：让网格永远是满的，而不是留白 -->
      <div v-for="n in slots.placeholders" :key="`lock-${n}`" class="stage-card locked bevel">
        <div class="stage-top">
          <span class="stage-no">STAGE {{ String(n + 1).padStart(2, '0') }}</span>
          <span class="stage-new lock-tag">LOCKED</span>
        </div>
        <div class="lock-art">
          <span v-for="b in 12" :key="b" class="lock-bit" />
        </div>
        <h3 class="lock-title">？？？</h3>
        <p class="lock-hint">继续写作即可解锁</p>
      </div>
    </div>

    <!-- 分页器：像素风页码，取代滚动 -->
    <div class="world-foot">
      <div class="pager">
        <button class="pager-btn" :disabled="page === 0" @click="page -= 1">◀ PREV</button>
        <span class="pager-dots">
          <i
            v-for="n in pageCount"
            :key="n"
            class="dot"
            :class="{ on: n - 1 === page }"
            @click="((page = n - 1), (selected = 0))"
          />
        </span>
        <button class="pager-btn" :disabled="page >= pageCount - 1" @click="page += 1">NEXT ▶</button>
      </div>
      <div class="keys">
        <span>←→ 翻页</span>
        <span>↑↓ 选择</span>
        <span>A 进入</span>
        <span v-if="canGoBack">B 返回</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world {
  min-height: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 28px;
  /* 场景占满一屏：内容不足时页脚贴底，内容超出时在屏内滚动而非拉长整页 */
  box-sizing: border-box;
}

.world-head {
  display: flex;
  justify-content: space-between;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
}

.world-label {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 16px 0 12px;
  flex-wrap: wrap;
}

.lab-en {
  font-size: 24px;
  color: var(--blue-600);
}

.lab-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}

.lab-count {
  margin-left: auto;
  color: var(--ink-faint);
}

.stage-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 3px dashed var(--blue-400);
  padding: 40px 20px;
  color: var(--ink);
  min-height: 320px;
}

.empty-art {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.empty-bit {
  width: 18px;
  height: 18px;
  border: 2px solid var(--blue-400);
}

.empty-bit:nth-child(3) {
  background: var(--blue-500);
  border-color: var(--blue-500);
}

.empty-text {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin: 0;
}

.empty-hint {
  font-size: 11.5px;
  color: var(--ink-soft);
  margin: 0;
}

.stage-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  /* 行高撑满剩余空间：一屏就是一个完整的关卡选择画面，不留空洞 */
  grid-auto-rows: minmax(200px, 1fr);
  align-content: stretch;
  min-height: 0;
}

@media (max-width: 760px) {
  .stage-grid {
    grid-template-columns: 1fr;
  }
}

.stage-card {
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
}

.stage-card.is-focused {
  /* 焦点：浅蓝底 + 加粗描边，而不是整卡反色发黑 */
  background: var(--blue-200);
  border-color: var(--blue-500);
  box-shadow: inset 0 0 0 2px var(--blue-500);
}

.stage-card.locked {
  cursor: default;
  /* 锁定卡用抖动图案压暗，而不是降低透明度 —— 像素世界不承认半透明 */
  background-image: radial-gradient(var(--ink-soft) 1px, transparent 1px);
  background-size: 4px 4px;
  background-position: 0 0;
}

.lock-tag {
  background: var(--blue-300);
  color: var(--ink);
}

.lock-art {
  display: grid;
  grid-template-columns: repeat(6, 12px);
  gap: 3px;
  align-content: center;
  justify-content: center;
  flex: 1;
  padding: 10px 0;
}

.lock-bit {
  width: 12px;
  height: 12px;
  background: var(--blue-300);
}

.lock-title {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.3em;
  color: var(--blue-400);
  text-align: center;
}

.lock-hint {
  margin: 0 0 6px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 11.5px;
  color: var(--ink-faint);
  text-align: center;
}

.stage-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-no {
  color: var(--ink-faint);
}

.stage-new {
  background: var(--spark);
  color: var(--paper);
  padding: 1px 6px;
}

.stage-card:not(.is-focused) .stage-new {
  animation: blink-step 640ms steps(1, end) infinite;
}

.stage-title {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 19px;
  line-height: 1.4;
}

.stage-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-soft);
  /* 严格截断，卡片高度统一 —— 像素世界不允许参差 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stage-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 6px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.author-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 12.5px;
}

.author-type {
  color: var(--ink-faint);
}

.tags {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.tag {
  border: 1.5px solid var(--blue-400);
  padding: 1px 6px;
  color: var(--blue-700);
}

.stage-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 2px solid var(--blue-300);
  padding-top: 7px;
  color: var(--ink-soft);
}

.score {
  color: var(--ink-faint);
}

.hearts {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--blue-500);
}

.hearts.hot {
  color: var(--spark);
}

.heart-num {
  margin-left: 4px;
  color: var(--ink-soft);
}

.date {
  margin-left: auto;
  color: var(--ink-faint);
}

.world-foot {
  border-top: 2px solid var(--blue-300);
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pager {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pager-btn {
  font: inherit;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 5px 12px;
  cursor: pointer;
}

.pager-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.pager-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border: 2px solid var(--blue-400);
  cursor: pointer;
}

.dot.on {
  background: var(--blue-500);
}

.keys {
  display: flex;
  gap: 14px;
  color: var(--ink-soft);
}
</style>
