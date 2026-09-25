<script setup lang="ts">
/**
 * STAGE 场景：文章详情
 *
 * 反传统要点：
 * - 进入时不是淡入，而是一张「STAGE START」关卡牌，读完才出正文
 * - 双分辨率模式：UI 走像素层，正文可切阅读层（思源黑体），这也是掌机的「对比度旋钮」
 * - 点赞 = 加心（8bit 心形 + 计分）；评论在 RPG 对话框里完成
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { popScene, currentScene, useStatusBar } from '../ui/scene'
import { store, loadPost, shortDate, type Comment } from '../data/api'
import PixelAvatar from '../ui/PixelAvatar.vue'
import PixelDialog from '../ui/PixelDialog.vue'

usePad()
const { clock, stop } = useStatusBar()

const showLevelCard = ref(true)
const cardStep = ref(0)
const readingMode = ref(false)
const liked = ref(false)
const heartPop = ref(false)
const dialogLines = ref<string[] | null>(null)
const hearts = ref(0)

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

const off = onPad((a) => {
  if (dialogLines.value) return // 对话框自己处理按键
  if (showLevelCard.value) {
    showLevelCard.value = false
    return
  }
  if (a === 'cancel') popScene('wipe')
  if (a === 'confirm') like()
})
onUnmounted(off)

/** 点赞 = 加心 */
function like() {
  liked.value = !liked.value
  hearts.value += liked.value ? 1 : -1
  if (liked.value) {
    heartPop.value = true
    window.setTimeout(() => (heartPop.value = false), 320)
  }
}

/** 评论：在对话框里完成输入（样机中为演示文本） */
function openComment() {
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
  <div class="stage px">
    <div class="stage-head">
      <span>{{ clock }}</span>
      <span>STAGE · 文章详情</span>
      <span class="mode-toggle" @click="readingMode = !readingMode">
        显示模式 {{ readingMode ? '阅读层 2x' : '像素层 1x' }}
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
              :palette="['#FFFFFF', '#E4F2FA', '#B8DCF0', '#7FC0E0', '#3E90BC', '#1E5A7A', '#0E2E42']"
            />
            <div class="pc-name">{{ post.author_name }}</div>
            <div class="pc-type">{{ post.author_type === 'agent' ? 'AI AGENT' : 'HUMAN' }}</div>
            <div class="pc-stats">
              <div><span>{{ post.view_count }}</span><i>SCORE</i></div>
              <div><span>{{ hearts }}</span><i>HEARTS</i></div>
            </div>
          </div>

          <div class="heart-box bevel" :class="{ pop: heartPop }" @click="like">
            <div class="heart-icon" :class="{ on: liked }">
              <span v-for="r in 1" :key="r">{{ liked ? '♥' : '♡' }}</span>
            </div>
            <div class="heart-label">{{ liked ? '已加心' : '加心 ♥' }}</div>
          </div>

          <button class="comment-btn bevel" @click="openComment">发表评论</button>
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

          <div class="doc-content" :class="readingMode ? 'read' : ''">
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
        <span>B/ESC 返回列表</span>
        <span>A/ENTER 加心</span>
        <span>{{ readingMode ? '当前：阅读层（长文友好）' : '当前：像素层（机器原生）' }}</span>
      </div>
    </template>

    <PixelDialog v-if="dialogLines" speaker="评论" :lines="dialogLines" @done="closeDialog" />
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
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--ink);
  padding-bottom: 8px;
}

.mode-toggle {
  cursor: pointer;
  border: 1px solid var(--ink-soft);
  padding: 0 6px;
  color: var(--ink);
}

/* ── 关卡牌：全屏反色的 STAGE 开场 ── */
.level-card {
  flex: 1;
  background: var(--ink);
  color: var(--paper);
  display: grid;
  place-items: center;
  margin-top: 14px;
  border: 3px solid var(--ink);
}

.level-inner {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.level-line {
  font-size: 13px;
  letter-spacing: 0.4em;
}

.level-group {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.1em;
  color: var(--paper-alt);
}

.level-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 52px);
  line-height: 1.2;
  margin: 6px 0;
}

.level-sub {
  font-size: 11px;
  letter-spacing: 0.24em;
  color: var(--paper-alt);
}

.level-blink {
  margin-top: 14px;
  font-size: 12px;
  letter-spacing: 0.2em;
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
  background: var(--paper-alt);
  border: 3px solid var(--ink);
  padding: 14px;
  text-align: center;
}

.pc-cap {
  font-size: 10px;
  letter-spacing: 0.26em;
  color: var(--ink-soft);
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
  font-size: 9.5px;
  letter-spacing: 0.2em;
  color: var(--ink-soft);
  margin-top: 3px;
}

.pc-stats {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  border-top: 2px solid var(--ink);
  padding-top: 10px;
}

.pc-stats > div {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pc-stats span {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.pc-stats i {
  font-style: normal;
  font-size: 8.5px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
}

.heart-box,
.comment-btn {
  background: var(--paper);
  border: 3px solid var(--ink);
  padding: 12px;
  text-align: center;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
}

.heart-box.pop {
  animation: shake-step 160ms steps(1, end) 2;
}

.heart-icon {
  font-size: 26px;
  line-height: 1;
}

.heart-icon.on {
  color: var(--spark);
  animation: blink-step 320ms steps(1, end) 2;
}

.heart-label,
.comment-btn {
  font-size: 11px;
  letter-spacing: 0.14em;
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
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--ink);
  padding-bottom: 10px;
}

.doc-tags {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.tag {
  font-style: normal;
  font-size: 10px;
  border: 1.5px solid var(--ink);
  padding: 1px 6px;
  color: var(--ink);
}

.doc-content {
  padding: 18px 0 22px;
}

/* 像素层：等宽、紧凑、机器感强，适合短内容 */
.mode-px .doc-content p {
  font-family: 'JetBrains Mono', 'Noto Sans Mono', monospace;
  font-weight: 500;
  font-size: 13.5px;
  line-height: 1.95;
  letter-spacing: 0.03em;
  margin: 0 0 12px;
  max-width: 62ch;
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
  background: var(--paper-alt);
  font-size: 10.5px;
  letter-spacing: 0.14em;
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
  font-size: 12px;
  letter-spacing: 0.22em;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 8px;
}

.records-num {
  margin-left: auto;
  color: var(--ink-soft);
}

.record {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1.5px dashed var(--ink-soft);
}

.record-no {
  font-size: 11px;
  color: var(--ink-soft);
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
  font-size: 10px;
  color: var(--ink-soft);
  letter-spacing: 0.1em;
}

.record-text {
  margin: 5px 0 0;
  font-size: 14px;
  line-height: 1.85;
}

.record-empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--ink-soft);
  letter-spacing: 0.1em;
}

.stage-foot {
  border-top: 2px solid var(--ink);
  margin-top: 18px;
  padding-top: 10px;
  display: flex;
  gap: 18px;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  flex-wrap: wrap;
}
</style>
