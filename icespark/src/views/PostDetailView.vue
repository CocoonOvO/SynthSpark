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
 *
 * ── 迁移自样机 `scenes/ArticleScene.vue`（架构 §16），机械改写清单 ──
 * · 文章 key：样机读 `ui/scene` 的 `frame.param`，生产版从路由取 ——
 *   `useRoute()` + `String(route.params.key ?? '')`（URL 是 `/post/:key`，路由名 `article`，
 *   路由表由主线补，本页不碰 router）。
 * · 数据层：裸 ref `store` → `stores/content` 的 pinia 实例（`store.post.value` → `content.post`，
 *   pinia 自动解包、没有 `.value`）；`loadPost(k)` 变成 store 的同名 action；
 *   `shortDate` 从 `@/api/format` 来。**不留任何 mock 数据。**
 * · 输入层：**`usePad()` 不迁** —— 外壳已经挂了唯一的键盘监听器（`@/input` 的 `mountInput`），
 *   场景再挂一个就是双触发；场景一律用 `onPad(handler)`，off 句柄在 `onUnmounted` 释放。
 *   同样不迁 `useFocusList` / 全局 `focusIndex` / `playFocusMove`（§16.3），
 *   共享焦点一律 `useFocusGroup()`，音效一律 `playSfx()`。
 * · 其余 import 只是按 §16.1 映射表换目录；`AVATAR_PALETTE` 从写死的数组
 *   改成按当前配色方案现算（与列表页同一处改法）。
 * · 模板结构 / 类名 / scoped 样式 / testid / 文案 / 间距字号**一字未改**；
 *   只有四处为过生产 tsconfig（`noUncheckedIndexedAccess` + 契约类型）而做的
 *   类型层改写，四处都在原地写了注释：点赞初值、`playSfx('cancel')`、`ACTIONS[i]`、
 *   芯片点击的焦点赋值。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { focusShellRoot } from '@/input'
import { onPad } from '@/input/pad'
import { useStatusBar } from '@/scene/clock'
import { scrollScreenBy, scrollScreenTo } from '@/scene/screen'
import { useFocusGroup } from '@/input/focus'
import { goPosts, goBackOrPosts, goTab } from '@/scene/nav'
import { playSfx, type SfxKind } from '@/input/sfx'
import { useAvatarStore } from '@/stores/avatars'
import { useContentStore } from '@/stores/content'
import { shortDate } from '@/api/format'
import PixelAvatar from '@/signal/PixelAvatar.vue'
import PixelDialog from '@/machine/PixelDialog.vue'
import ImageFrame from '@/frame/ImageFrame.vue'
import { coverOk, markCoverFailed } from '@/scene/cover'
import MarkdownBody from '@/signal/MarkdownBody.vue'
import SceneHead from '@/machine/SceneHead.vue'
import { ACTIVE_PALETTE, PALETTES, avatarPalette } from '@/styles/tokens'
import { usePageTitle } from '@/frame/documentMeta'

const route = useRoute()
const content = useContentStore()
const avatars = useAvatarStore()

/**
 * 样机是 `styles/tokens.ts` 里写死的 `AVATAR_PALETTE` 数组；
 * 生产版按 §16.1 改成按当前配色方案现算（加主题时组件一行都不用改）。
 */
const AVATAR_PALETTE = avatarPalette(PALETTES[ACTIVE_PALETTE])

const { clock, stop } = useStatusBar()

/** 一次方向键滚动的像素数：8px 栅格的整数倍，离散跳步而不是平滑滚动 */
const SCROLL_STEP = 64
/** PgUp / PgDn 滚一屏 */
const PAGE_STEP = 360

const liked = ref(false)
const heartPop = ref(false)
const dialogLines = ref<string[] | null>(null)
const hearts = ref(0)
/** 本文档根节点：用来判定原生焦点（Tab 遍历）是否落在正文范围内 */
const rootEl = ref<HTMLElement | null>(null)

const ACTIONS = [
  { key: 'like', label: '点赞' },
  { key: 'comment', label: '评论' },
  { key: 'back', label: '返回列表' },
] as const

/** 横向操作条：初始 -1 表示未进入，因此进场时 Enter 不会误触第一个动作 */
const actionFocus = useFocusGroup({ initial: -1 })

/**
 * 焦点分区（用户第 7 条）：
 *   'none'    没进任何分区 → 方向键滚动正文
 *   'chips'   分组 / 标签芯片行（G 键直达，芯片可跳到对应列表）
 *   'actions' 点赞 / 评论 / 返回 操作栏（L 键直达）
 * 用一条 zone 管住两块，才不会出现「芯片和操作栏同时高亮」的双焦点。
 */
const zone = ref<'none' | 'chips' | 'actions'>('none')
/**
 * 芯片行的焦点。
 *
 * 样机模板里芯片的点击写的是 `chipFocus.index = i` —— 那是把 `index` 这个 ref **整个换成了数字**，
 * 点过一次之后脚本里所有 `chipFocus.index.value` 都读成 undefined（`isChipFocused` 从此恒假），
 * 是样机的一处笔误（它被 `set()` 的闭包遮住了，只有视觉上看得出来）。
 * 生产版本来也不允许给 `Ref` 赋值（vue-tsc 报 TS2322），所以这里按 `useFocusGroup` 的公开语义
 * 改成 `chipFocus.click(i)`：静音把焦点挪到 i，与样机「点芯片 = 焦点落到该芯片」的意图一致；
 * 键盘路径（G 直达 / ←→ 行内移动 / ESC 退出分区）逐字未改。
 */
const chipFocus = useFocusGroup({ initial: -1 })

const post = computed(() => content.post)

// 浏览器标题跟着文章走（打开之前不知道名字）；组件卸载自动让位给路由那张表
usePageTitle(() => post.value?.title)
const comments = computed(() => content.comments)

/** 芯片列表：分组在前，标签在后，顺序与 DOM 一致（焦点索引才对得上） */
const chips = computed(() => {
  const list: { kind: 'group' | 'tag'; label: string }[] = []
  if (post.value?.group_name) list.push({ kind: 'group', label: post.value.group_name })
  for (const t of post.value?.tags ?? []) list.push({ kind: 'tag', label: t })
  return list
})

onMounted(async () => {
  // 深链接 /post/:key 能直接进来，所以正文用「路由参数」加载，而不是靠上一层传值
  // （样机读的是 `frame.param`；生产版就是当前路由的 `:key`）
  const key = String(route.params.key ?? '')
  await content.loadPost(key && key !== 'all' ? key : undefined)
  // 契约的 Post 没有 like_count（点赞数在 GET /api/likes/{post_id} → PostWithLikeStatus.like_count，
  // 属 P6 互动范围）。样机这里是 post.like_count；正式版先落 0，
  // 其余交互（本地 toggle + 音效 + 心形弹一下）与样机逐字一致，一道不改。
  hearts.value = 0
})
onUnmounted(stop)

function runAction(key: string) {
  if (key === 'like') like()
  else if (key === 'comment') openComment()
  else backToList()
}

/** 返回列表：优先走浏览器历史（从列表点进来的），深链接进来时退到列表页 */
function backToList() {
  // 样机这里写 `playSfx('cancel')`，可两边的 `SfxKind` 都只有 move / confirm / heart / transition，
  // 也就是说这声在样机里本来就是**静默无效**的（`playSfx` 内部 catch 掉了取不到配方的那次调用）。
  // 照搬语义就得保持「不发声」：删掉这一句会改行为，换成别的音效又是新设计。
  // 所以原样传 'cancel'，只补一个类型断言让 vue-tsc 过关 —— 运行时行为与样机逐字一致。
  playSfx('cancel' as SfxKind)
  goBackOrPosts(post.value?.group_name || undefined)
}

/** 芯片 = 链接：分组跳分组列表，标签跳标签列表（用户第 7 条） */
function openChip(i: number) {
  const c = chips.value[i]
  if (!c) return
  playSfx('confirm')
  if (c.kind === 'group') goPosts({ group: c.label }, 'wipe')
  else goPosts({ tag: c.label }, 'wipe')
}

/**
 * 原生焦点（Tab 走出来的链接）与自绘焦点（.is-focused）共存的两条规矩：
 *
 * 1. 原生焦点在本文档内时，**回车/空格交给浏览器**：它自己会激活那个链接。
 *    否则一次回车会先被我们的 confirm 分支处理一次、再被浏览器处理一次，
 *    变成「按一下跳两次」（历史里多出一条）。
 * 2. 我们自己的焦点一动（方向键 / G / L / 鼠标划过），就把原生焦点收掉，
 *    保证屏幕上永远只有一个光标。这一条正是第六轮加 Tab 遍历时最容易翻车的地方。
 */
function nativeFocusInside(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && el !== document.body && !!rootEl.value?.contains(el)
}

function dropNativeFocus() {
  if (!nativeFocusInside()) return
  // 收回到外壳根节点，**不是** `blur()` 到 body：焦点掉到 body 后键盘事件不再冒泡到
  // 外壳的监听器上，整块键盘会失灵（实测：Tab 进正文链接 → 方向键 → 之后 P 打不开菜单）
  focusShellRoot()
}

const off = onPad((a) => {
  if (dialogLines.value) return false // 对话框自己处理按键

  if (a === 'confirm' && nativeFocusInside()) return false

  // TAB 必须**原样还给浏览器**：这一页没有标签栏，样机冻结的口径是
  // 「TAB 严格按 DOM 顺序遍历可聚焦项」（`round6.mjs`）。而下面那句 `dropNativeFocus()`
  // 会调 `focusShellRoot()` = `.app.focus()`，它同时把浏览器的**顺序焦点导航起点**挪到
  // `.app` 上 —— 于是下一次 TAB 又从文档里第一个可聚焦项开始，焦点永远卡在第一枚芯片上
  // （真 bug，实测 `chip-group-0` → `chip-group-0`）。样机当年用 `blur()`（焦点落 body）
  // 不会挪那个起点，§21 把 `blur()` 换成 `focusShellRoot()` 时引入了这个回归。
  if (a === 'tabNext' || a === 'tabPrev') return false

  dropNativeFocus()

  if (a === 'up' || a === 'down') {
    // 方向键始终是「滚动正文」：屏幕是 overflow 容器而不是文档，
    // 浏览器原生方向键滚不动它，所以显式滚一步；滚不动了就把按键交还浏览器
    exitZone()
    return scrollScreenBy(a === 'down' ? SCROLL_STEP : -SCROLL_STEP)
  }

  if (a === 'pageNext' || a === 'pagePrev') {
    return scrollScreenBy(a === 'pageNext' ? PAGE_STEP : -PAGE_STEP)
  }

  // 回到文章顶部（用户第 7 条）
  if (a === 'toTop') {
    exitZone()
    return scrollScreenTo(0)
  }

  // 快捷键直达：G 分组 / 标签行，L 点赞评论栏（用户第 7 条）
  if (a === 'focusGroup') {
    if (!chips.value.length) return true
    zone.value = 'chips'
    if (chipFocus.index.value < 0) chipFocus.set(0)
    playSfx('move')
    return true
  }
  if (a === 'focusLike') {
    zone.value = 'actions'
    if (actionFocus.index.value < 0) actionFocus.set(0)
    playSfx('move')
    return true
  }

  if (a === 'right' || a === 'left') {
    const d = a === 'right' ? 1 : -1
    if (zone.value === 'chips') {
      const next = chipFocus.index.value + d
      if (next < 0 || next >= chips.value.length) return false
      chipFocus.set(next)
      return true
    }
    if (zone.value === 'actions') {
      const i = actionFocus.index.value
      if (d < 0 && i === 0) {
        actionFocus.set(-1, true)
        zone.value = 'none'
        return true
      }
      if (i < 0) {
        actionFocus.set(0)
        return true
      }
      if (i >= ACTIONS.length - 1 && d > 0) return false
      actionFocus.set(i + d)
      return true
    }
    // 还没进任何分区：→ 直接进操作栏，← 不做事
    if (d < 0) return false
    zone.value = 'actions'
    actionFocus.set(0)
    playSfx('move')
    return true
  }

  if (a === 'confirm') {
    if (zone.value === 'chips') {
      openChip(chipFocus.index.value)
      return true
    }
    if (zone.value === 'actions' && actionFocus.index.value >= 0) {
      // 下标判空：上面 `>= 0` 已排除 -1，ACTIONS 是 as const 的定长三元组
      runAction(ACTIONS[actionFocus.index.value]!.key)
      return true
    }
    return false
  }

  // ESC：先退出当前分区；没进分区时交还给全局（全局用它开菜单）
  if (a === 'cancel') {
    if (zone.value !== 'none') {
      exitZone()
      return true
    }
    return false
  }

  return false
})

/** 退出分区：两块焦点都收回「未进入」态 */
function exitZone() {
  if (zone.value === 'none') return
  zone.value = 'none'
  actionFocus.set(-1, true)
  chipFocus.set(-1, true)
}
onUnmounted(off)

function isFocused(i: number) {
  return zone.value === 'actions' && actionFocus.index.value === i
}

function isChipFocused(i: number) {
  return zone.value === 'chips' && chipFocus.index.value === i
}

function hoverAction(i: number) {
  // hover 在 useFocusGroup 里已经静音（鼠标划过不出声）
  dropNativeFocus()
  zone.value = 'actions'
  actionFocus.hover(i)
}

function hoverChip(i: number) {
  dropNativeFocus()
  zone.value = 'chips'
  chipFocus.hover(i)
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
  <div ref="rootEl" class="article">
    <SceneHead :title="`文章 · ${post?.group_name || '未分组'}`" :clock="clock">
      <span v-if="post" class="head-date hint">{{ shortDate(post.created_at) }}</span>
    </SceneHead>

    <!-- 这一篇读不出来时给**页内空态 + 两个动作**（用户裁决 §58）：
         原先无论哪种失败都只剩「读取正文 …」，永远不会结束，用户既看不到原因也走不掉。 -->
    <div
      v-if="!post && content.postError"
      class="state px"
      :data-testid="content.postError === 'missing' ? 'post-missing' : 'post-error'"
    >
      <p class="state-title">
        {{ content.postError === 'missing' ? '这篇文章不存在或已删除。' : '正文读取失败。' }}
      </p>
      <p class="state-hint hint">
        {{
          content.postError === 'missing'
            ? '地址里的编号没有对应的文章，或者它还没有公开。'
            : '后端不可达或接口出错，稍后再试。'
        }}
      </p>
      <!-- 两个动作：与全站一致的 .btn.focusable（原生 Tab + 回车即可，不必用鼠标） -->
      <div class="state-actions">
        <button class="btn focusable mini" data-testid="post-fallback-posts" @click="goPosts({}, 'wipe')">
          返回列表
        </button>
        <button class="btn focusable mini" data-testid="post-fallback-home" @click="goTab('home', 'wipe')">
          回主页
        </button>
      </div>
    </div>

    <div v-else-if="!post" class="loading px"><span class="blink">▌</span> 读取正文 …</div>

    <div v-else class="doc-wrap">
      <h1 class="doc-title">{{ post.title }}</h1>

      <!-- 元信息：作者并入这里，取代原来的左侧作者卡竖列 -->
      <div class="doc-meta px">
        <PixelAvatar
          :src="post.author_avatar"
          :rows="avatars.rowsFor(post.author_name)"
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
      </div>

      <!-- 分组 / 标签：不只是展示，点一下就到对应列表（G 键直达本行） -->
      <div v-if="chips.length" class="chips" data-testid="chips">
        <span class="chips-cap px">归类</span>
        <button
          v-for="(c, i) in chips"
          :key="`${c.kind}:${c.label}`"
          class="chip focusable mini"
          :data-testid="`chip-${c.kind}-${i}`"
          :class="{ 'is-focused': isChipFocused(i), group: c.kind === 'group' }"
          @mouseenter="hoverChip(i)"
          @click="((zone = 'chips'), chipFocus.click(i), openChip(i))"
        >
          <span v-if="c.kind === 'group'" class="chip-mark">▣</span>
          <span v-else class="chip-mark">#</span>{{ c.label }}
          <span class="chip-go">→</span>
        </button>
      </div>

      <!-- 封面：没有（或加载失败）就整块不渲染，正文直接顶上来 -->
      <ImageFrame
        v-if="coverOk(post.cover_image)"
        class="doc-cover"
        :src="post.cover_image"
        :alt="post.title"
        ratio="21 / 9"
        @error="markCoverFailed(post.cover_image)"
      />

      <!-- 横向操作条：取代左侧竖列，窄屏自然折行 -->
      <div class="actions" data-testid="actions">
        <button
          class="act focusable"
          data-testid="action-like"
          :class="{ 'is-focused': isFocused(0), on: liked, pop: heartPop }"
          @mouseenter="hoverAction(0)"
          @click="(actionFocus.hover(0), like())"
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
          @click="(actionFocus.hover(1), openComment())"
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
          @click="(actionFocus.hover(2), backToList())"
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
      <!-- 顺序按用户口径：上下 → 左右 → 翻页，其余随后。
           TAB / ENTER 照样好使（TAB 遍历链接、ENTER 执行），只是不标在这里 ——
           提示条只留这一页「不容易猜到」的键 -->
      <span class="kb"><i class="kbd">↑</i><i class="kbd">↓</i> 滚动</span>
      <span class="kb"><i class="kbd">←</i><i class="kbd">→</i> 行内移动</span>
      <span class="kb"><i class="kbd">PgUp</i><i class="kbd">PgDn</i> 翻页</span>
      <span class="kb"><i class="kbd">G</i> 分组/标签</span>
      <span class="kb"><i class="kbd">L</i> 点赞评论</span>
      <span class="kb"><i class="kbd">U</i> 回顶部</span>
      <span class="kb"><i class="kbd">Q</i> 返回</span>
      <span class="kb tail"><i class="kbd">P</i>/<i class="kbd">ESC</i> 菜单</span>
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

/* 空态（§58）：标题 + 一句解释 + 两个动作，居中一块，别让用户面对一个空屏幕 */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  text-align: center;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 18px;
  margin: 0;
  color: var(--ink);
}

.state-hint {
  margin: 0;
  color: var(--ink-soft);
}

.state-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
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

/* 分组 / 标签芯片行：既是展示也是链接（用户第 7 条） */
.chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.chips-cap {
  color: var(--ink-faint);
}

.chip {
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--paper);
  border: 2px solid var(--blue-300);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
}

.chip.group {
  border-color: var(--blue-500);
}

.chip-mark {
  color: var(--blue-400);
}

/* 跳转箭头常显（淡），划过或聚焦时加深 —— 芯片是链接这件事不该靠悬停才发现 */
.chip-go {
  color: var(--blue-300);
}

.chip:hover .chip-go,
.chip.is-focused .chip-go {
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
