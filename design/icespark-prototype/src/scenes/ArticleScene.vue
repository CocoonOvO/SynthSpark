<script setup lang="ts">
/**
 * ARTICLE 场景：文章详情
 *
 * 用户反馈第 5 条的三处改动都在这里：
 * 1. 去掉进场「关卡牌」这类仪式化开场，直接给正文
 * 2. 干掉左侧竖列（作者 / 点赞 / 评论 / 返回）—— 在窄屏上它只会把正文挤成一条。
 *    改成标题下的**横向操作条**：作者信息并入元信息行，动作按钮横排
 * 3. 正文容器宽度自适应（只设上限，不写死像素），并接上 markdown 渲染器
 * 4. 快捷键指南固定在文章底部（sticky），不用滚到底才看得到，且刻意做得很轻
 *
 * 阅读层的取舍：像素是外壳，文档是本体 —— 标题/代码/表格走像素字体，
 * 大段正文走中文黑体，长文才读得下去。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { popScene, currentScene, useStatusBar, scrollScreenBy } from '../ui/scene'
import { useFocusGroup } from '../ui/focus'
import { playSfx } from '../ui/sfx'
import { store, loadPost, shortDate } from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import PixelDialog from '../ui/PixelDialog.vue'
import ImageFrame from '../ui/ImageFrame.vue'
import MarkdownBody from '../ui/MarkdownBody.vue'
import SceneHead from '../ui/SceneHead.vue'
import { AVATAR_PALETTE } from '../styles/tokens'

usePad()
const { clock, stop } = useStatusBar()

/** 一次方向键滚动的像素数：8px 栅格的整数倍，离散跳步而不是平滑滚动 */
const SCROLL_STEP = 64
/** PgUp / PgDn 滚一屏 */
const PAGE_STEP = 360

const liked = ref(false)
const heartPop = ref(false)
const dialogLines = ref<string[] | null>(null)
const hearts = ref(0)

const ACTIONS = [
  { key: 'like', label: '点赞' },
  { key: 'comment', label: '评论' },
  { key: 'back', label: '返回列表' },
] as const

/** 横向操作条：初始 -1 表示未进入，因此进场时 Enter 不会误触第一个动作 */
const actionFocus = useFocusGroup({ initial: -1 })

const post = computed(() => store.post.value)
const comments = computed(() => store.comments.value)

onMounted(async () => {
  const id = currentScene.value.param
  await loadPost(id && id !== 'all' ? id : undefined)
  hearts.value = post.value?.like_count ?? 0
})
onUnmounted(stop)

function runAction(key: string) {
  if (key === 'like') like()
  else if (key === 'comment') openComment()
  else popScene('wipe')
}

const off = onPad((a) => {
  if (dialogLines.value) return false // 对话框自己处理按键

  if (a === 'up' || a === 'down') {
    // 方向键始终是「滚动正文」：屏幕是 overflow 容器而不是文档，
    // 浏览器原生方向键滚不动它，所以显式滚一步；滚不动了就把按键交还浏览器
    if (actionFocus.index.value >= 0) actionFocus.set(-1, true)
    return scrollScreenBy(a === 'down' ? SCROLL_STEP : -SCROLL_STEP)
  }

  if (a === 'pageNext' || a === 'pagePrev') {
    return scrollScreenBy(a === 'pageNext' ? PAGE_STEP : -PAGE_STEP)
  }

  if (a === 'right') {
    const i = actionFocus.index.value
    if (i < 0) actionFocus.set(0)
    else if (i < ACTIONS.length - 1) actionFocus.set(i + 1)
    return true
  }

  if (a === 'left') {
    const i = actionFocus.index.value
    if (i < 0) return false
    actionFocus.set(i - 1, i === 0)
    return true
  }

  if (a === 'confirm') {
    if (actionFocus.index.value < 0) return false
    runAction(ACTIONS[actionFocus.index.value].key)
    return true
  }

  if (a === 'cancel') {
    if (actionFocus.index.value >= 0) {
      actionFocus.set(-1, true)
      return true
    }
    popScene('wipe')
    return true
  }

  return false
})
onUnmounted(off)

function isFocused(i: number) {
  return actionFocus.index.value === i
}

function hoverAction(i: number) {
  // hover 在 useFocusGroup 里已经静音（鼠标划过不出声）
  actionFocus.hover(i)
}

function like() {
  liked.value = !liked.value
  hearts.value += liked.value ? 1 : -1
  playSfx(liked.value ? 'heart' : 'move')
  if (liked.value) {
    heartPop.value = true
    window.setTimeout(() => (heartPop.value = false), 320)
  }
}

function openComment() {
  playSfx('confirm')
  dialogLines.value = [
    '在这里发表评论。匿名访客需要留下称呼（1–50 字），登录用户会自动署名。',
    '（样机演示：实际调用 POST /api/comments。匿名可提交，但按 IP 限流 24 小时 20 条、间隔 30 秒。）',
  ]
}

function closeDialog() {
  dialogLines.value = null
}
</script>

<template>
  <div class="article">
    <SceneHead :title="`文章 · ${post?.group_name || '未分组'}`" :clock="clock">
      <span v-if="post" class="head-date hint">{{ shortDate(post.created_at) }}</span>
    </SceneHead>

    <div v-if="!post" class="loading px">
      <span class="blink">▌</span> 读取正文 …
    </div>

    <div v-else class="doc-wrap">
      <h1 class="doc-title">{{ post.title }}</h1>

      <!-- 元信息：作者并入这里，取代原来的左侧作者卡竖列 -->
      <div class="doc-meta px">
        <PixelAvatar
          :src="post.author_avatar"
          :name="post.author_name"
          :size="16"
          :display="28"
          :palette="AVATAR_PALETTE"
        />
        <span class="meta-author">{{ post.author_name }}</span>
        <span class="meta-type hint">{{ post.author_type === 'agent' ? 'AGENT' : 'HUMAN' }}</span>
        <span class="sep">·</span>
        <span class="hint">{{ shortDate(post.created_at) }}</span>
        <span class="sep">·</span>
        <span class="hint num">◉ {{ post.view_count }}</span>
        <template v-if="post.tags.length">
          <span class="sep">·</span>
          <span class="tags">
            <i v-for="t in post.tags" :key="t" class="tag">{{ t }}</i>
          </span>
        </template>
      </div>

      <ImageFrame
        v-if="post.cover_image"
        class="doc-cover"
        :src="post.cover_image"
        :alt="post.title"
        ratio="21 / 9"
      />

      <!-- 横向操作条：取代左侧竖列，窄屏自然折行 -->
      <div class="actions" data-testid="actions">
        <button
          class="act focusable"
          data-testid="action-like"
          :class="{ 'is-focused': isFocused(0), on: liked, pop: heartPop }"
          @mouseenter="hoverAction(0)"
          @click="((actionFocus.hover(0)), like())"
        >
          <span class="act-icon">{{ liked ? '♥' : '♡' }}</span>
          <span class="act-label">{{ liked ? '已点赞' : '点赞' }}</span>
          <span class="act-num">{{ hearts }}</span>
        </button>

        <button
          class="act focusable"
          data-testid="action-comment"
          :class="{ 'is-focused': isFocused(1) }"
          @mouseenter="hoverAction(1)"
          @click="((actionFocus.hover(1)), openComment())"
        >
          <span class="act-icon">▤</span>
          <span class="act-label">评论</span>
          <span class="act-num">{{ comments.length }}</span>
        </button>

        <button
          class="act focusable"
          data-testid="action-back"
          :class="{ 'is-focused': isFocused(2) }"
          @mouseenter="hoverAction(2)"
          @click="((actionFocus.hover(2)), popScene('wipe'))"
        >
          <span class="act-icon">◀</span>
          <span class="act-label">返回列表</span>
        </button>
      </div>

      <!-- 正文：markdown 渲染，宽度只设上限 -->
      <div class="doc-body">
        <MarkdownBody :source="post.content" />
      </div>

      <!-- 评论区 -->
      <section class="records">
        <div class="records-cap px">
          <span>评论</span>
          <span class="records-num hint">{{ comments.length }}</span>
        </div>
        <div v-for="(c, i) in comments" :key="c.id" class="record">
          <span class="record-no px">{{ String(i + 1).padStart(2, '0') }}</span>
          <div class="record-main">
            <div class="record-head px">
              <span class="record-author">{{ c.author.display_name || c.author.username }}</span>
              <span class="hint">{{ shortDate(c.created_at) }}</span>
            </div>
            <p class="record-text read">{{ c.content }}</p>
          </div>
        </div>
        <div v-if="!comments.length" class="record-empty hint">还没有人留言。</div>
      </section>
    </div>

    <!-- 快捷键指南：sticky 在屏幕底部，滚动时始终可见，刻意做得轻 -->
    <div class="keybar px" data-testid="keybar">
      <span class="kb"><i class="kbd">↑</i><i class="kbd">↓</i> 滚动</span>
      <span class="kb"><i class="kbd">PgUp</i><i class="kbd">PgDn</i> 整屏</span>
      <span class="kb"><i class="kbd">→</i> 操作栏</span>
      <span class="kb"><i class="kbd">←</i> 退出操作栏</span>
      <span class="kb"><i class="kbd">ENTER</i> 执行</span>
      <span class="kb"><i class="kbd">ESC</i> 返回列表</span>
      <span class="kb tail">P 菜单</span>
    </div>

    <PixelDialog
      v-if="dialogLines"
      speaker="评论"
      :lines="dialogLines"
      @done="closeDialog"
      @close="closeDialog"
    />
  </div>
</template>

<style scoped>
.article {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 0;
}

.head-date {
  color: var(--ink-faint);
}

.loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
}

/* 正文容器：跟随视口自适应，只设上限，不写死像素宽度 */
.doc-wrap {
  width: 100%;
  max-width: min(100%, 1180px);
  margin: 0 auto;
  padding: 16px 0 24px;
  display: flex;
  flex-direction: column;
}

.doc-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(24px, 3.4vw, 38px);
  line-height: 1.3;
  margin: 0 0 12px;
  color: var(--ink);
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-200);
  padding-bottom: 10px;
}

.meta-author {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
}

.meta-type {
  border: 1.5px solid var(--blue-300);
  padding: 0 4px;
}

.sep {
  color: var(--blue-300);
}

.num {
  font-variant-numeric: tabular-nums;
}

.tags {
  display: flex;
  gap: 6px;
}

.tag {
  font-style: normal;
  border: 1.5px solid var(--blue-400);
  padding: 0 5px;
  color: var(--blue-700);
}

.doc-cover {
  margin-top: 18px;
}

/* 横向操作条：不再是左侧竖列 */
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0 4px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--blue-200);
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--blue-700);
  padding: 7px 14px;
  cursor: pointer;
}

.act.on {
  color: var(--spark);
  border-color: var(--spark);
}

.act-icon {
  font-size: 16px;
  line-height: 1;
}

.act-label {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  font-weight: 700;
}

.act-num {
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.act.pop {
  animation: shake-step 160ms steps(1, end) 2;
}

.doc-body {
  padding: 6px 0 8px;
}

.records {
  margin-top: 22px;
}

.records-cap {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
  color: var(--blue-600);
}

.records-num {
  margin-left: auto;
}

.record {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1.5px dashed var(--blue-300);
}

.record-no {
  color: var(--ink-faint);
  padding-top: 3px;
}

.record-main {
  flex: 1;
  min-width: 0;
}

.record-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.record-author {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 13px;
}

.record-text {
  margin: 5px 0 0;
  font-size: 14px;
  line-height: 1.85;
}

.record-empty {
  padding: 14px 0;
}

/* 快捷键指南：贴在滚动容器底部，始终可见；低对比度，不抢正文 */
.keybar {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  background: var(--paper-alt);
  border-top: 2px solid var(--blue-200);
  padding: 6px 10px;
  color: var(--ink-faint);
  font-size: 12px;
  z-index: 5;
}

.kb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kb .kbd {
  color: var(--ink-soft);
  border-color: var(--blue-300);
  background: var(--paper);
  padding: 0 4px;
}

.kb.tail {
  margin-left: auto;
}

@media (max-width: 700px) {
  .keybar {
    gap: 8px;
  }
}
</style>
