<script setup lang="ts">
/**
 * STAGE 场景：文章详情
 *
 * 反传统要点：
 * - 进入时不是淡入，而是一张「STAGE START」关卡牌，读完才出正文
 * - 分辨率由全局信号档决定（信号 0/1 → 阅读层，2/3 → 像素层），页内不再放第二个开关
 * - 点赞 = 加心（8bit 心形 + 计分）；评论在 RPG 对话框里完成
 *
 * 输入设计（键盘/鼠标等价）：
 * - ↑↓ 默认**不被消费**，交还给浏览器做原生滚动 —— 长文必须能用方向键读
 * - → 进入右侧动作栏、← 退出；进入后 ↑↓ 才用于在动作间移动
 * - 动作栏初始无焦点，因此 A/Enter 不会误触「加心」（这是上一版的缺陷）
 * - 鼠标路径：划过共享焦点（静音），点击直接执行；返回列表也是可点的实体按钮
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { popScene, currentScene, useStatusBar, scrollScreenBy } from '../ui/scene'
import { useFocusGroup } from '../ui/focus'
import { playSfx } from '../ui/sfx'
import { signalLevel, SIGNAL_LABELS } from '../ui/prefs'
import { store, loadPost, shortDate } from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import PixelDialog from '../ui/PixelDialog.vue'
import { AVATAR_PALETTE } from '../styles/tokens'

usePad()
const { clock, stop } = useStatusBar()

const showLevelCard = ref(true)
const cardStep = ref(0)
const liked = ref(false)
const heartPop = ref(false)
const dialogLines = ref<string[] | null>(null)
const hearts = ref(0)

/** 正文字体层由信号档决定：0 纯净 / 1 阅读 → 阅读层；2 标准 / 3 原教旨 → 像素层 */
const readingMode = computed(() => signalLevel.value <= 1)

/** 一次方向键滚动的像素数：取 8px 栅格的整数倍，离散跳步而不是平滑滚动 */
const SCROLL_STEP = 64

/** 右侧动作栏：键盘与鼠标共用同一焦点，初始 -1 表示「未进入动作栏」 */
const ACTIONS = [
  { key: 'like', label: '加心' },
  { key: 'comment', label: '发表评论' },
  { key: 'back', label: '返回列表' },
] as const
const actionFocus = useFocusGroup({
  // 初始 -1：进场时方向键归浏览器（滚动正文），A 键也不会误触动作
  initial: -1,
})

const post = computed(() => store.post.value)
const comments = computed(() => store.comments.value)

const cardSteps = computed(() => [
  'STAGE',
  post.value?.group_name || '未分组',
  post.value?.title || '',
  `CLIMB 1-1 · ${post.value?.author_name || ''}`,
])

let timers: number[] = []

onMounted(async () => {
  const id = currentScene.value.param
  await loadPost(id && id !== 'all' ? id : undefined)
  hearts.value = post.value?.like_count ?? 0
  // 关卡牌逐步出字，出完自动进场
  cardSteps.value.forEach((_, i) => {
    timers.push(window.setTimeout(() => (cardStep.value = i + 1), 320 * (i + 1)))
  })
  timers.push(window.setTimeout(() => (showLevelCard.value = false), 320 * (cardSteps.value.length + 1)))
})

onUnmounted(() => {
  timers.forEach((t) => window.clearTimeout(t))
  stop()
})

/** 执行动作栏当前项 */
function runAction(key: string) {
  if (key === 'like') like()
  else if (key === 'comment') openComment()
  else popScene('wipe')
}

/** 键盘路径。返回 true 表示已消费该按键 */
const off = onPad((a) => {
  if (dialogLines.value) return false // 对话框自己处理按键

  if (showLevelCard.value) {
    // 开场牌：任意键跳过
    showLevelCard.value = false
    return true
  }

  if (a === 'up' || a === 'down') {
    // 未进入动作栏时，方向键就是「滚动正文」：
    // 屏幕是一个 overflow 容器而不是文档，浏览器原生方向键滚不动它，
    // 所以这里显式滚一步；滚不动了就交还浏览器（不制造死键）
    if (actionFocus.index.value < 0) {
      const step = a === 'down' ? SCROLL_STEP : -SCROLL_STEP
      return scrollScreenBy(step)
    }
    const dir = a === 'down' ? 1 : -1
    // 动作栏内移动；到边界时不消费（让页面顺手滚一点，不制造死键）
    if (!actionFocus.moveBy(dir as 1 | -1, ACTIONS.length)) return false
    return true
  }

  if (a === 'right') {
    actionFocus.set(actionFocus.index.value < 0 ? 0 : actionFocus.index.value)
    return true
  }

  if (a === 'left') {
    if (actionFocus.index.value < 0) return false
    actionFocus.set(-1, true)
    return true
  }

  if (a === 'confirm') {
    // 没有进入动作栏就什么都不做 —— 不再把 Enter 当成「加心」
    if (actionFocus.index.value < 0) return false
    runAction(ACTIONS[actionFocus.index.value].key)
    return true
  }

  if (a === 'cancel') {
    // 先退出动作栏，再退出场景，避免一次按键连退两层
    if (actionFocus.index.value >= 0) {
      actionFocus.set(-1, true)
      return true
    }
    popScene('wipe')
    return true
  }

  return false
})

/** 鼠标路径 */
function hoverAction(i: number) {
  actionFocus.hover(i)
}
function isFocused(i: number) {
  return actionFocus.index.value === i
}

/** 点赞 = 加心 */
function like() {
  liked.value = !liked.value
  hearts.value += liked.value ? 1 : -1
  playSfx(liked.value ? 'heart' : 'move')
  if (liked.value) {
    heartPop.value = true
    window.setTimeout(() => (heartPop.value = false), 320)
  }
}

/** 评论：在对话框里完成输入（样机中为演示文本） */
function openComment() {
  playSfx('confirm')
  dialogLines.value = [
    '在这里发表评论。匿名访客需要留下称呼，登录用户则会自动署名。',
    '（样机演示：实际会调用 POST /api/comments，未登录需 author_name，24 小时限 20 条）',
  ]
}

function closeDialog() {
  dialogLines.value = null
}

/** 正文分段：像素世界用离散段落，不做首行缩进 */
const paragraphs = computed(() => (post.value?.content || '').split('\n').filter((s) => s.trim()))
</script>

<template>
  <div class="stage px" :data-reading="readingMode ? 'true' : 'false'">
    <div class="stage-head">
      <span>{{ clock }}</span>
      <span>STAGE · 文章详情</span>
      <span class="head-signal">
        SIGNAL {{ signalLevel }} · {{ SIGNAL_LABELS[signalLevel] }} · {{ readingMode ? '阅读层' : '像素层' }}
      </span>
    </div>

    <!-- 关卡开场牌 -->
    <div v-if="showLevelCard" class="level-card invert">
      <div class="level-inner">
        <div class="level-line" v-if="cardStep >= 1">STAGE</div>
        <div class="level-group" v-if="cardStep >= 2">{{ cardSteps[1] }}</div>
        <div class="level-title" v-if="cardStep >= 3">{{ cardSteps[2] }}</div>
        <div class="level-sub" v-if="cardStep >= 4">{{ cardSteps[3] }}</div>
        <div class="level-blink blink" v-if="cardStep >= 4">▶ START</div>
      </div>
    </div>

    <template v-else-if="post">
      <div class="stage-body">
        <!-- 左栏：作者玩家卡 + 状态 -->
        <aside class="side">
          <div class="player-card bevel">
            <div class="pc-cap">PLAYER</div>
            <PixelAvatar
              :src="post.author_avatar"
              :name="post.author_name"
              :size="20"
              :display="72"
              :palette="AVATAR_PALETTE"
            />
            <div class="pc-name">{{ post.author_name }}</div>
            <div class="pc-type">{{ post.author_type === 'agent' ? 'AI AGENT' : 'HUMAN' }}</div>
            <div class="pc-stats">
              <div><span>{{ post.view_count }}</span><i>SCORE</i></div>
              <div><span>{{ hearts }}</span><i>HEARTS</i></div>
            </div>
          </div>

          <div
            class="heart-box bevel focusable"
            data-testid="action-like"
            :class="{ pop: heartPop, 'is-focused': isFocused(0) }"
            @mouseenter="hoverAction(0)"
            @click="((actionFocus.hover(0)), like())"
          >
            <div class="heart-icon" :class="{ on: liked }">
              <span>{{ liked ? '♥' : '♡' }}</span>
            </div>
            <div class="heart-label">{{ liked ? '已加心' : '加心 ♥' }}</div>
          </div>

          <button
            class="comment-btn bevel focusable"
            data-testid="action-comment"
            :class="{ 'is-focused': isFocused(1) }"
            @mouseenter="hoverAction(1)"
            @click="((actionFocus.hover(1)), openComment())"
          >
            发表评论
          </button>

          <button
            class="comment-btn bevel focusable back-btn"
            data-testid="action-back"
            :class="{ 'is-focused': isFocused(2) }"
            @mouseenter="hoverAction(2)"
            @click="((actionFocus.hover(2)), popScene('wipe'))"
          >
            ◀ 返回列表
          </button>
        </aside>

        <!-- 右栏：正文，双分辨率 -->
        <main class="doc" :class="readingMode ? 'mode-read' : 'mode-px'">
          <h1 class="doc-title">{{ post.title }}</h1>
          <div class="doc-meta">
            <span>{{ shortDate(post.created_at) }}</span>
            <span v-if="post.group_name">· {{ post.group_name }}</span>
            <span class="doc-tags">
              <i v-for="t in post.tags" :key="t" class="tag">{{ t }}</i>
            </span>
          </div>

          <div class="doc-content" :class="readingMode ? 'read' : ''" data-testid="doc">
            <p v-for="(para, i) in paragraphs" :key="i">{{ para }}</p>
          </div>

          <div class="doc-stats bevel-in">
            <span>SCORE {{ String(post.view_count).padStart(6, '0') }}</span>
            <span>HEARTS {{ hearts }}</span>
            <span>TIME {{ shortDate(post.created_at) }}</span>
          </div>

          <!-- 评论区：以「记录」形式呈现，不是现代卡片流 -->
          <section class="records">
            <div class="records-cap">
              <span>COMMENTS</span>
              <span class="records-num">{{ comments.length }}</span>
            </div>
            <div v-for="(c, i) in comments" :key="c.id" class="record">
              <span class="record-no">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="record-main">
                <div class="record-head">
                  <span class="record-author">{{ c.author.display_name || c.author.username }}</span>
                  <span class="record-date">{{ shortDate(c.created_at) }}</span>
                </div>
                <p class="record-text read">{{ c.content }}</p>
              </div>
            </div>
            <div v-if="!comments.length" class="record-empty">还没有人留言。</div>
          </section>
        </main>
      </div>

      <div class="stage-foot">
        <span>↑↓ 滚动正文（每次 64px）</span>
        <span>→ 进入动作栏 · ← 退出</span>
        <span>B/ESC {{ isFocused(2) || actionFocus.index.value >= 0 ? '退出动作栏' : '返回列表' }}</span>
        <span class="foot-note">{{ readingMode ? '阅读层（长文友好）' : '像素层（机器原生）' }} · 由信号档控制</span>
      </div>
    </template>

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
.stage {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 28px;
}

.stage-head {
  display: flex;
  justify-content: space-between;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
}

.head-signal {
  border: 1px solid var(--blue-400);
  padding: 0 6px;
  color: var(--blue-700);
  background: var(--blue-100);
}

/* ── 关卡牌：全屏反色的 STAGE 开场 ── */
.level-card {
  flex: 1;
  background: var(--blue-200);
  color: var(--ink);
  display: grid;
  place-items: center;
  margin-top: 14px;
  border: 3px solid var(--blue-500);
}

.level-inner {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.level-line {
  font-size: 24px;
  color: var(--blue-500);
}

.level-group {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--blue-700);
}

.level-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 52px);
  line-height: 1.2;
  margin: 6px 0;
  color: var(--blue-700);
}

.level-sub {
  color: var(--ink-soft);
}

.level-blink {
  margin-top: 14px;
  color: var(--blue-600);
}

/* ── 正文区 ── */
.stage-body {
  flex: 1;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 22px;
  padding-top: 16px;
  align-items: start;
}

@media (max-width: 860px) {
  .stage-body {
    grid-template-columns: 1fr;
  }
}

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 16px;
}

.player-card {
  background: var(--blue-100);
  border: 3px solid var(--blue-400);
  padding: 14px;
  text-align: center;
}

.pc-cap {
  color: var(--ink-faint);
  margin-bottom: 10px;
}

.player-card :deep(.pixel-avatar) {
  margin: 0 auto;
}

.pc-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin-top: 10px;
}

.pc-type {
  color: var(--ink-faint);
  margin-top: 3px;
}

.pc-stats {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  border-top: 2px solid var(--blue-300);
  padding-top: 10px;
}

.pc-stats > div {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pc-stats span {
  font-size: 24px;
  color: var(--blue-600);
  font-variant-numeric: tabular-nums;
}

.pc-stats i {
  font-style: normal;
  color: var(--ink-faint);
}

.heart-box,
.comment-btn {
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 12px;
  text-align: center;
  cursor: pointer;
  font: inherit;
  color: var(--blue-700);
}

/* 动作栏焦点：与全站一致，浅蓝底 + 左侧粗条，不用发光 */
.heart-box.is-focused,
.comment-btn.is-focused {
  background: var(--blue-200);
  border-color: var(--blue-500);
  outline: 2px solid var(--blue-500);
  outline-offset: -6px;
}

.back-btn {
  color: var(--ink-soft);
}

.heart-box.pop {
  animation: shake-step 160ms steps(1, end) 2;
}

.heart-icon {
  font-size: 36px;
  line-height: 1;
}

.heart-icon.on {
  color: var(--spark);
  animation: blink-step 320ms steps(1, end) 2;
}

.heart-label,
.comment-btn {
  font-size: 11px;
}

.heart-label {
  margin-top: 6px;
  color: var(--ink-soft);
}

.doc {
  min-width: 0;
}

.doc-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(24px, 3.6vw, 38px);
  line-height: 1.28;
  margin: 0 0 12px;
}

.doc-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 10px;
}

.doc-tags {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.tag {
  font-style: normal;
  border: 1.5px solid var(--blue-400);
  padding: 1px 6px;
  color: var(--blue-700);
}

.doc-content {
  padding: 18px 0 22px;
}

/* 像素层：等宽、紧凑、机器感强，适合短内容 */
.mode-px .doc-content p {
  font-family: 'ArkPixel', monospace;
  font-size: 12px;
  line-height: 2.1;
  margin: 0 0 14px;
  max-width: 68ch;
}

/* 阅读层：思源黑体、放大、行距舒展，长文与移动端友好 */
.mode-read .doc-content p {
  font-size: 17px;
  line-height: 2;
  margin: 0 0 20px;
  max-width: 46em;
}

.doc-stats {
  display: flex;
  gap: 20px;
  padding: 9px 14px;
  background: var(--blue-100);
  border: 2px solid var(--blue-200);
  color: var(--ink-soft);
  flex-wrap: wrap;
}

.records {
  margin-top: 26px;
}

.records-cap {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
  color: var(--blue-600);
}

.records-num {
  margin-left: auto;
  color: var(--ink-soft);
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

.record-date {
  color: var(--ink-faint);
}

.record-text {
  margin: 5px 0 0;
  font-size: 14px;
  line-height: 1.85;
}

.record-empty {
  padding: 16px 0;
  color: var(--ink-soft);
}

.foot-note {
  margin-left: auto;
  color: var(--ink-faint);
}

.stage-foot {
  border-top: 2px solid var(--blue-300);
  margin-top: 18px;
  padding-top: 10px;
  display: flex;
  gap: 18px;
  color: var(--ink-soft);
  flex-wrap: wrap;
}
</style>
