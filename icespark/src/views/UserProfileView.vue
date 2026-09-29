<script setup lang="ts">
/**
 * USER 场景：用户档案（P4，路由 `/user/:username`）
 *
 * 内容与结构来自**旧前端**那一版（`frontend/src/views/user/UserProfileView.vue`，554 行）：
 * 用户卡（像素头像 · 显示名 · `@username` · 简介 · 三项统计）+ 该用户的已发布文章列表 +
 * 加载 / 用户不存在 / 文章为空三态。
 *
 * 样机（`design/icespark-prototype`）里**没有这一页**，所以口径只有两个来源：
 * 旧前端的内容结构 + 本仓（icespark）的皮肤与交互规则（架构 §16.5）。
 *
 * ── 按本仓规则对旧前端做的改写（完整偏差表见交付报告） ──
 * 1. **随机渐变不搬**：旧前端 `getRandomGradient()` 会给无封面文章配一条随机
 *    `linear-gradient`。本项目没有渐变，无封面的文章换成文字卡版式（照
 *    `PostListView.vue` / `HomeView.vue` 的无封面版式：不摆空图位、正文占满整行、
 *    分组与日期顶在一条 `post-head` 上）。
 * 2. **头像走 `PixelAvatar`**：旧前端没头像时渲染用户名的首字母文本；本仓的口径是
 *    `PixelAvatar`（无头像时按 `name` 哈希出一张「机器居民」面孔）。传 `name = username`，
 *    同一用户名每次得到同一张脸，「一眼分辨不同用户」这个功能目的保持不变。
 * 3. **配色只走 token**：scoped 样式里零色值字面量（旧前端的 `#hex` / 渐变 / 投影 /
 *    圆角全部换成硬边 + 网点语言，圆角一律 0）。
 * 4. **动效离散**：旧前端的 `spin` 旋转 loading 动画（`border-radius:50%` + `ease`）
 *    不搬，加载态照样机的「闪烁光标 + 机器字样」（`.state.px` + `.blink`）。
 * 5. **键盘监听**：页面里**绝不**自己 `window.addEventListener('keydown')` —— 全站唯一的
 *    键盘监听器是外壳的 `mountInput`，这里只用 `onPad(handler)` 并在 `onUnmounted` 释放。
 *    焦点用现有的 `useFocusGroup()` + `spatialIndex()`，键盘与鼠标共享同一份焦点状态
 *    （鼠标 `hover` 静音移动同一个 index），这是本仓的输入等价性口径。
 * 6. **数据层只走 `src/api/*`**：`api/users.ts` 的 `fetchUserByUsername()` +
 *    `api/posts.ts` 新增的 `fetchPostsByAuthor()`，两者都通过 `client.ts` 的 `getJson`。
 *    这里**没有**走 `stores/content`：内容 store 的 `posts` 是首页 / 列表页共享的唯一一份
 *    列表，拿它取某个作者的文章会把整站列表改掉。
 * 7. **三项统计的口径照旧前端**（契约里没有用户统计端点，只能现算）：
 *    文章数 = 后端返回的 `total`；获赞 = 该批文章的 `like_count` 之和；
 *    阅读 = 该批文章的 `view_count` 之和。三条都是从 `GET /api/posts/?author_id=…`
 *    这一批数据算出来的（旧前端同样是 `total` + 逐条累加，上限 100 条）。
 * 8. **返回**：顶部一个可点的「返回」按钮 + 键盘 `Q`（全站的历史后退键，见
 *    `App.vue` 的全局 `back` 分支），两条路径调用同一个 `back()`，键盘 / 鼠标完全等价。
 *    `Q` 在页面里显式接管，只是为了补上旧前端没有的**深链接兜底**：地址栏直接打开
 *    `/user/xxx` 时历史里没有上一页，就回主页，否则键盘用户会卡死在这一页
 *    （`nav.ts` 里有 `goBackOrPosts()`，但它的兜底落点是文章列表 —— 对「别人的主页」
 *    这一页不合适；`canGoBack` / `goBack` / `goTab` 都是 `nav.ts` 已有的能力，没有新造）。
 *    `ESC` 按全站口径**不抢**：先退出「返回键」这一格，再按一次交还全局呼出菜单
 *    （与 `PostDetailView.vue` 一致：它的 keybar 标的也是「Q 返回 / P·ESC 菜单」）。
 * 9. **`h1` 自己出**：`App.vue` 的 `SELF_TITLED_SCENES` 加上了 `user`，外壳不再发隐藏 h1，
 *    所以这一页的显示名就是页面上唯一的一级标题；文章标题用 `h2`（h1 → h2 不跳级，
 *    正是本轮 a11y 口径要求的）。三个状态里 `h1` 都在（用户卡常驻），不会出现无标题页。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { ApiError } from '@/api/client'
import { postKey, shortDate, shortNum } from '@/api/format'
import { fetchPostsByAuthor } from '@/api/posts'
import type { PostListItem } from '@/api/types'
import { fetchUserByUsername, type User } from '@/api/users'
import ImageFrame from '@/frame/ImageFrame.vue'
import { spatialIndex, useFocusGroup } from '@/input/focus'
import { focusShellRoot } from '@/input'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { coverOk, markCoverFailed } from '@/scene/cover'
import { canGoBack, goArticle, goBack, goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import PixelAvatar from '@/signal/PixelAvatar.vue'
import { ACTIVE_PALETTE, PALETTES, avatarPalette } from '@/styles/tokens'

/** 头像调色板按当前配色方案现算（与列表页 / 文章页同一处改法，加主题时不用改这里） */
const AVATAR_PALETTE = avatarPalette(PALETTES[ACTIVE_PALETTE])

const { clock, stop } = useStatusBar()
const route = useRoute()

/** 用户名来自路由参数（URL 是唯一真相来源），深链接 / 前进后退都会重新取 */
const username = computed(() => String(route.params.username ?? ''))

/**
 * 四态：`loading` 读取中 · `ready` 有档案 · `missing` 404 用户不存在 · `error` 其它失败。
 * 后两态都是**页内空态**，不是整页 404：URL 仍然是 `/user/xxx`，场景仍然是 `user`
 * （底栏点亮 USER 那一格），只是内容区告诉用户这一份档案读不出来。
 */
type ProfileState = 'loading' | 'ready' | 'missing' | 'error'
const state = ref<ProfileState>('loading')

const user = ref<User | null>(null)
const posts = ref<PostListItem[]>([])
/** 后端返回的文章总数（旧前端也是拿 total 当「文章数」，不是当前这一页的条数） */
const total = ref(0)

/** 竞态守卫：快速改地址栏（/user/a → /user/b）时，慢的那个响应必须丢掉 */
let reqId = 0

/** 显示名优先 `display_name`，没有才退用户名（旧前端口径）；三者都空时给一个兜底标题 */
const displayName = computed(
  () => user.value?.display_name || user.value?.username || username.value || '用户档案',
)

/** 简介：空则占位 —— 文案照旧前端（`'暂无简介'`） */
const bio = computed(() => user.value?.bio || '暂无简介')

/** 三项统计：文章数（total）/ 获赞 / 阅读，全部从这一批文章现算（旧前端口径） */
const articlesCount = computed(() => total.value)
const likesCount = computed(() => posts.value.reduce((sum, p) => sum + (p.like_count || 0), 0))
const viewsCount = computed(() => posts.value.reduce((sum, p) => sum + (p.view_count || 0), 0))

/** 无封面的文章换版式（不摆空图位）；判断口径与列表 / 首页 / 文章页同一处（scene/cover.ts） */
function hasCover(p: PostListItem) {
  return coverOk(p.cover_image)
}

/**
 * 加载档案。
 * 用户资料取不到：404 → 「用户不存在」，其余（后端不可达 / 500）→ 读取失败空态，
 * 两种情况都不抛未捕获异常（e2e 有「运行期零报错」的用例）。
 * 资料拿到了、文章列表挂了：按空列表渲染（旧前端就是 `catch` 后留空数组），
 * 用户卡照常显示 —— 不能因为文章接口抖动就说「这个人不存在」。
 */
async function load(): Promise<void> {
  const id = ++reqId
  state.value = 'loading'
  user.value = null
  posts.value = []
  total.value = 0

  try {
    const u = await fetchUserByUsername(username.value)
    if (id !== reqId) return
    user.value = u

    try {
      const list = await fetchPostsByAuthor(u.id, 100)
      if (id !== reqId) return
      posts.value = list.items || []
      total.value = list.total || 0
    } catch {
      posts.value = []
      total.value = 0
    }

    if (id === reqId) state.value = 'ready'
  } catch (err) {
    if (id !== reqId) return
    state.value = err instanceof ApiError && err.status === 404 ? 'missing' : 'error'
  }
}

onMounted(() => {
  scrollScreenTop()
  void load()
})

/**
 * 换一个用户名时重新取。
 * 必须自己盯：外壳的 `viewKey` 只带路由参数 `:key`（文章页那个），
 * 所以 `/user/a` → `/user/b` 不会重建组件，不监听就会一直显示上一个人的档案。
 */
watch(username, () => {
  scrollScreenTop()
  void load()
})

onUnmounted(stop)

// ── 焦点：两块可交互区，键盘与鼠标共享同一份状态 ──

/**
 * `'back'` = 页头那个返回按钮，`'card'` = 文章卡列表。
 * 列表是**单列**（旧前端的文章列表也是竖着一行一张），所以 `COLS = 1`：
 * `spatialIndex` 下 ↑↓ 走相邻卡、←→ 没有相邻项（返回 null，把按键还给浏览器）。
 */
const COLS = 1
const zone = ref<'back' | 'card'>('card')
const cardFocus = useFocusGroup({ initial: 0 })

function isCardFocused(i: number): boolean {
  return zone.value === 'card' && cardFocus.index.value === i
}

function isBackFocused(): boolean {
  return zone.value === 'back'
}

/**
 * 返回上一页：历史里有上一页就回退，没有（地址栏直接打开这一页）就回主页。
 * 顶部按钮与 `Q` 键走同一个函数 —— 键盘 / 鼠标路径完全等价。
 */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/** 打开一篇文章：key 优先 slug（与列表 / 首页同一个 `postKey`） */
function open(p?: PostListItem): void {
  if (!p) return
  playSfx('confirm')
  goArticle(postKey(p), 'flash')
}

/** 鼠标：划过共享焦点（静音），点击直接执行 */
function hoverCard(i: number): void {
  zone.value = 'card'
  cardFocus.hover(i)
}
function clickCard(p: PostListItem, i: number): void {
  hoverCard(i)
  open(p)
}
function hoverBack(): void {
  zone.value = 'back'
}

/**
 * 原生焦点（Tab 走出来的「返回」按钮与外壳软键）与自绘焦点共存的两条规矩，
 * 与文章页同源（`PostDetailView.vue` 的注释最全）：
 *
 * 1. 原生焦点落在会响应回车的元素上（这里是页头的 `<button>` 与外壳软键）时，
 *    回车交给浏览器原生激活。否则本页的 `confirm` 会把软键那一下吞掉 ——
 *    Tab 到「音效」软键按回车，键被吃、软键不响应（实测）。
 * 2. 我们自己的焦点一动（方向键 / 鼠标划过），就把原生焦点收掉，
 *    屏幕上永远只有一个光标（闪烁方块）。
 *
 * 本页的文章卡是 `<article>`（不会响应回车），所以它们不落进规矩 1，
 * Tab 到卡片再按回车仍由本页的共享焦点处理。
 */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  // 收回外壳根节点，**不是** `blur()` 到 body：焦点掉到 body 之后键盘事件不再冒泡到
  // 外壳的监听器，整块键盘会失灵（实测见 `src/input/index.ts` 的注释）
  focusShellRoot()
}

const off = onPad((a) => {
  // Q：全站的历史后退键。这里显式接管只是为了让「深链接进来没有上一页」也有落点。
  if (a === 'back') {
    back()
    return true
  }

  if (a === 'confirm') {
    // 规矩 1：原生焦点在页头按钮或外壳软键上时，这一下回车归浏览器
    if (nativeOwnsEnter()) return false
    if (zone.value === 'back') {
      back()
      return true
    }
    open(posts.value[cardFocus.index.value])
    return true
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 规矩 2：方向键一动就收掉原生焦点
    dropNativeFocus()
    if (zone.value === 'back') {
      // 返回键下不去：列表为空时不动（按键还给浏览器，不制造死键）
      if (a === 'down' && posts.value.length > 0) {
        zone.value = 'card'
        playSfx('move')
        return true
      }
      return false
    }
    const next = spatialIndex(cardFocus.index.value, a, COLS, posts.value.length)
    if (next === null) {
      // 第一张卡再往上 → 焦点交给返回键（这一页没有标签栏，页头就是它的「上面」）
      if (a === 'up' && posts.value.length > 0) {
        zone.value = 'back'
        playSfx('move')
        return true
      }
      return false
    }
    cardFocus.set(next)
    return true
  }

  // ESC：先退出「返回键」这一格；没在这一格时交还全局（全局用它呼出菜单，全站口径）
  if (a === 'cancel') {
    if (zone.value === 'back') {
      zone.value = 'card'
      playSfx('move')
      return true
    }
    return false
  }

  return false
})
onUnmounted(off)
</script>

<template>
  <div class="user">
    <SceneHead title="用户档案 · USER" :clock="clock">
      <span v-if="user" class="head-handle">@{{ user.username }}</span>
      <!-- 返回：鼠标能点，键盘 Q（同一个 back()）。Tab 在无标签栏的页面上还给浏览器，
           所以这个真实 <button> 也能被 Tab 走到、回车原生激活 -->
      <button
        class="back focusable mini"
        data-testid="user-back"
        :class="{ 'is-focused': isBackFocused() }"
        @mouseenter="hoverBack"
        @click="back"
      >
        ◀ 返回 (Q)
      </button>
    </SceneHead>

    <!-- 用户卡：四个状态里都在（h1 因此永远存在，不会出现没有一级标题的页面） -->
    <header class="profile" data-testid="user-card">
      <PixelAvatar
        class="profile-avatar"
        :src="user?.avatar_url ?? null"
        :name="user?.username || username"
        :size="16"
        :display="72"
        :palette="AVATAR_PALETTE"
      />

      <div class="profile-info">
        <h1 class="profile-name">{{ displayName }}</h1>
        <span v-if="user" class="profile-handle px">@{{ user.username }}</span>
        <p v-if="state === 'ready'" class="profile-bio read">{{ bio }}</p>

        <!-- 三项统计：数字走像素字体（机器读数），标签走可读黑体 -->
        <div v-if="state === 'ready'" class="profile-stats px" data-testid="user-stats">
          <span class="pstat"
            ><b>{{ shortNum(articlesCount) }}</b
            ><i>文章</i></span
          >
          <span class="pstat"
            ><b>{{ shortNum(likesCount) }}</b
            ><i>获赞</i></span
          >
          <span class="pstat"
            ><b>{{ shortNum(viewsCount) }}</b
            ><i>阅读</i></span
          >
        </div>
      </div>
    </header>

    <!-- 状态一：读取中 -->
    <div v-if="state === 'loading'" class="state px" data-testid="user-loading">
      <span class="blink">▌</span> 读取用户档案 …
    </div>

    <!-- 状态二：404 —— 页内空态，不是整页 404 -->
    <div v-else-if="state === 'missing'" class="state px" data-testid="user-missing">
      <p class="state-title">用户不存在</p>
      <p class="state-hint hint">@{{ username }} 这个用户名下没有档案。</p>
    </div>

    <!-- 状态三：其它失败（后端不可达 / 接口出错）也给空态，不白屏、不整页 404 -->
    <div v-else-if="state === 'error'" class="state px" data-testid="user-error">
      <p class="state-title">用户档案读取失败。</p>
      <p class="state-hint hint">后端不可达或接口出错，稍后再试。</p>
    </div>

    <!-- 状态四：这个人还没有已发布的文章 -->
    <div v-else-if="!posts.length" class="state px" data-testid="user-empty">
      <p class="state-title">该用户还没有发布文章。</p>
    </div>

    <!-- 已发布文章列表：单列，一行一张横排卡（封面在左、正文在右） -->
    <div v-else class="posts" data-testid="user-posts">
      <article
        v-for="(p, i) in posts"
        :key="p.id"
        class="post focusable"
        data-testid="user-post-card"
        :class="{ 'is-focused': isCardFocused(i), 'is-text': !hasCover(p) }"
        @mouseenter="hoverCard(i)"
        @click="clickCard(p, i)"
      >
        <!-- 有封面：画框在左，3:2 与列表页同一版式 -->
        <div v-if="hasCover(p)" class="post-cover">
          <ImageFrame
            :src="p.cover_image"
            :alt="p.title"
            ratio="3 / 2"
            @error="markCoverFailed(p.cover_image)"
          />
        </div>

        <div class="post-body">
          <!-- 分组 + 日期：有封面 / 无封面都在这一条上（旧前端的 meta 行也在标题之上） -->
          <div class="post-head px">
            <span class="head-group">{{ p.group_name || '未分组' }}</span>
            <span class="head-date num">{{ shortDate(p.created_at) }}</span>
          </div>

          <!-- 一级标题是显示名，卡片标题是 h2：层级不跳级 -->
          <h2 class="post-title">{{ p.title }}</h2>
          <p class="post-intro read">{{ p.introduction || '（暂无简介）' }}</p>

          <div class="post-foot px num">
            <span>◉ {{ p.view_count }}</span>
            <span>♥ {{ p.like_count }}</span>
          </div>
        </div>
      </article>
    </div>

    <div class="foot sticky-foot px hint">
      ↑↓ 选卡 · ENTER / 点击打开 · ↑ 到顶回返回键 · Q 返回 · P / ESC 菜单
    </div>
  </div>
</template>

<style scoped>
.user {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 14px;
}

.head-handle {
  color: var(--blue-600);
}

/* 页头那个返回按钮：与列表页的「清除」同一个按钮语言（硬边、直角） */
.back {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

/* ── 用户卡 ── */
.profile {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 14px;
}

.profile-avatar {
  flex: 0 0 auto;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.profile-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(22px, 2.6vw, 32px);
  line-height: 1.3;
  margin: 0;
  color: var(--ink);
}

.profile-handle {
  color: var(--blue-500);
}

.profile-bio {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-soft);
  max-width: 60ch;
}

.profile-stats {
  display: flex;
  align-items: baseline;
  gap: 22px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.pstat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

/* 数字是机器读数：像素字体（.px 已给）+ 24px 档（12 的倍数，字形锐利） */
.pstat b {
  font-weight: 400;
  font-size: 24px;
  color: var(--blue-600);
  font-variant-numeric: tabular-nums;
}

/* 标签是给用户读的中文：可读黑体（写法照 AboutView.vue 的 .fact-v） */
.pstat i {
  font-style: normal;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink-faint);
}

/* ── 空态 / 加载态（写法照 PostListView.vue） ── */
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 3px dashed var(--blue-400);
  color: var(--ink);
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

/* ── 文章列表：单列，一行一张横排卡 ── */
.posts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.post {
  display: flex;
  align-items: stretch;
  gap: 14px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 10px;
  cursor: pointer;
  min-width: 0;
}

.post-cover {
  flex: 0 0 240px;
  min-width: 0;
  align-self: flex-start;
}

.post-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 分组 / 日期行：与首页文字卡、列表页页脚同一套「标题行」语言 */
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

.post-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: break-word;
}

.post-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 无封面版式：正文占满整行、标题更大、摘要多给几行（不摆空图位） */
.post.is-text .post-title {
  font-size: 22px;
}

.post.is-text .post-intro {
  font-size: 14px;
  -webkit-line-clamp: 4;
}

.post-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 6px;
  color: var(--ink-soft);
}

.num {
  font-variant-numeric: tabular-nums;
}

.foot {
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 760px) {
  .profile {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .post {
    flex-direction: column;
  }

  .post-cover {
    flex: 0 0 auto;
    width: 100%;
  }
}
</style>
