<script setup lang="ts">
/**
 * WRITE 场景：写作台（P6，路由 `/write` 与 `/write/:key`）
 *
 * 样机 `design/icespark-prototype/` 里**没有写作页**，所以这一页的设计是**先与用户确认**
 * 才动的（硬要求 4）。定稿过程与逐条裁决写在架构 §28，这里只留结论与「为什么」：
 *
 *   D1 布局 → **方案 B**：正文独屏 + 两个覆盖面板
 *        `N` 文稿（分组 · 已发布/草稿 · 篇目）· `M` 资料（标签 · 封面 · 分组归属 · 文章操作）；
 *        `V` 只在窄屏有意义（宽屏预览栏是常驻的）。两个面板都是**页内模态**，同一时刻只开一个。
 *   D2 编辑器 → **E2 Markdown 源码 + 实时预览**（零新依赖）。预览用阅读页同一个
 *        `signal/MarkdownBody.vue`，所以「所写即所发」是结构保证，不是巧合。
 *   D4 旧版靠**右键菜单**呼出的文章操作 → 改成资料面板里的一行按钮（纯键盘路径下
 *        右键菜单不可达，与全站「键鼠等价」冲突）。
 *   D8 旧版三处死 UI 不迁：AI 助手占位块；「公开文章 / 允许评论」两个开关
 *        （只改本地 ref，全程不发后端，契约的 Post/PostCreate/PostUpdate 也没有这两个字段）；
 *        简介（`introduction`）旧编辑器没有输入口，照旧不给。
 *   D5 代码块语言清单 35 项原样保留（在 `signal/MarkdownSourceEditor.vue` 里）。
 *   D6 新稿未保存时**不拦截**离开（旧版没有这个行为），只在页头常显「未保存」。
 *   D7 发布后**留在本页**（旧版行为），另给一个「查看」入口。
 *
 * ── 输入模型（三条与既有页面一字不差的惯例） ──
 *
 * 1. **可编辑目标里只有两条例外**（`input/index.ts`）：`ESC` 失焦、`Shift + 字母` 走
 *    `resolveComboAction` 的白名单。所以 `N` / `M` / `V` 在正文里用 **`Shift+N` / `Shift+M` /
 *    `Shift+V`** 就能开（不必先退出正文）；`TAB` 出正文那条路照旧，两条路都通。
 * 2. **方向键一动就 `focusShellRoot()` 收掉原生焦点**（不是 `blur()`：焦点掉到 body 之后
 *    键盘事件不再冒泡到外壳，整块键盘当场失灵，§21 记的就是这条）。
 *    这批「焦点移动」键**不在**组合键白名单里：它们假设焦点不在输入框
 *    （见下面 `up/down/left/right` 分支），在正文里按 `Shift+A` 只会想打个大写 A。
 * 3. **原生焦点落在真实按钮 / 输入框上时回车归浏览器**（`nativeOwnsEnter()`），
 *    否则工具条那颗按钮会被本页的 `confirm` 吞掉。
 *
 * **ESC 的口径**（2026-09-30 用户裁定，§28.11）：焦点在正文 / 标题 / 标签框里时，
 * `ESC` 只做**失焦** —— 把焦点交回外壳根节点（不是 `blur()` 到 body），菜单留到失焦之后的
 * 第二下。基础态（焦点不在编辑框里）本页**不消费** ESC，全站口径 P / ESC = 菜单；
 * 但**页内模态（面板 / 确认框）开着时消费它**去关模态 —— 这与 `AdminLinksView` 的删除
 * 确认框、§27 的长文本弹窗同一先例。为什么这里必须消费：面板一开就置了 `pageModalOpen`，
 * 外壳的 ESC 分支见到它直接让位（`App.vue` 的 `inModal`），页面再不吃这个键，ESC 就成了
 * **死键**。§28.4 里那句「ESC 不消费」指的是基础态，页面级模态是既有先例的例外，已在 §28.9 记明。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { postKey, shortDate } from '@/api/format'
import { createGroup, fetchGroups } from '@/api/groups'
import { createPost, deletePost, fetchMyPosts, fetchPost, updatePost } from '@/api/posts'
import { fetchTags } from '@/api/tags'
import type { Group, Post, PostListItem } from '@/api/types'
import { isImageFile, MAX_IMAGE_BYTES, uploadImage } from '@/api/upload'
import { focusShellRoot } from '@/input'
import { spatialIndex, useFocusGroup } from '@/input/focus'
import { onPad, type PadAction } from '@/input/pad'
import { pageModalOpen } from '@/input/scopes'
import { playSfx } from '@/input/sfx'
import PixelDialog from '@/machine/PixelDialog.vue'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { canGoBack, goArticle, goBack, goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import { requestTransition } from '@/scene/transition'
import MarkdownBody from '@/signal/MarkdownBody.vue'
import MarkdownSourceEditor from '@/signal/MarkdownSourceEditor.vue'

const route = useRoute()
const router = useRouter()
const { clock, stop } = useStatusBar()

/* ══════════════════════ 面板 ══════════════════════ */

/** 页内三个覆盖面板；`null` = 没开 */
type Panel = 'docs' | 'meta' | 'preview'
const panel = ref<Panel | null>(null)

const PANEL_TITLE: Record<Panel, string> = { docs: '文稿', meta: '资料', preview: '预览' }

/* ══════════════════════ 分组与篇目 ══════════════════════ */

const groups = ref<Group[]>([])
/** 当前分组；空串 = 「全部」（没有分组的新站也能写作，不给用户一个死页面） */
const activeGroupId = ref('')
const groupNote = ref('')

const myPosts = ref<PostListItem[]>([])
type LoadState = 'loading' | 'ready' | 'empty' | 'error'
const docsState = ref<LoadState>('loading')
const docsError = ref('')
/** 文稿面板的两个小节（照旧版：文章 / 草稿） */
const docsTab = ref<'published' | 'draft'>('published')

/** 新建分组的输入框（面板内就地展开，不弹第二个框） */
const newGroupOpen = ref(false)
const newGroupName = ref('')

const activeGroup = computed(() => groups.value.find((g) => g.id === activeGroupId.value) ?? null)

/**
 * 当前分组下的篇目。
 *
 * ⚠️ 只能按 **`group_name`** 过滤：`GET /api/posts/my` 返回的是 `PostListItem`，
 * 契约里它**没有 `group_id`**（只有 `group_name`）。旧前端也因此按名字过滤。
 * 代价是分组改名后老文章会掉出列表 —— 这是**契约的字段缺口**，不是本页能修的；
 * 已写进 §28.9 的交付记录（要修得先给 `PostListItem` 加 `group_id`）。
 */
const docsInGroup = computed(() => {
  const g = activeGroup.value
  const list = myPosts.value.filter((p) => (g ? p.group_name === g.name : true))
  return list.filter((p) => (docsTab.value === 'draft' ? p.status === 'draft' : p.status !== 'draft'))
})

/** 已发布 / 草稿各自的条数（分节上的数字，来自当前分组那一批） */
function countIn(status: 'published' | 'draft'): number {
  const g = activeGroup.value
  return myPosts.value.filter(
    (p) => (g ? p.group_name === g.name : true) && (status === 'draft' ? p.status === 'draft' : p.status !== 'draft'),
  ).length
}

/* ══════════════════════ 当前文稿 ══════════════════════ */

/** 已存下来的文章 id；`null` = 还没落库的新稿 */
const postId = ref<string | null>(null)
const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const cover = ref<string | null>(null)
const status = ref<'draft' | 'published'>('draft')
const postGroupId = ref<string | null>(null)

/**
 * 已保存内容的指纹。`dirty` 只做一件事：页头那行状态与自动保存的判据。
 * 放在一处算，免得三处各写一份「什么算改过」。
 */
function fingerprintOf(parts: {
  title: string
  content: string
  tags: string[]
  cover: string | null
  status: 'draft' | 'published'
  groupId: string | null
}): string {
  return JSON.stringify([
    parts.title,
    parts.content,
    parts.tags,
    parts.cover,
    parts.status,
    parts.groupId,
  ])
}

function fingerprint(): string {
  return fingerprintOf({
    title: title.value,
    content: content.value,
    tags: tags.value,
    cover: cover.value,
    status: status.value,
    groupId: postGroupId.value,
  })
}
const snapshot = ref(fingerprint())
const dirty = computed(() => fingerprint() !== snapshot.value)

/** 落库那一刻的时间戳文字（空串 = 本次进来还没存过） */
const savedAt = ref('')
/** 最近这一次是自动保存还是人按的（页头那行字要分开说，旧版也是「已自动保存」） */
const saveKind = ref<'manual' | 'auto'>('manual')
const saving = ref(false)
const publishing = ref(false)
const busy = computed(() => saving.value || publishing.value)
const saveError = ref('')

/** 页头右侧那行字（照旧版的「保存中… / 已自动保存 / 保存失败」，措辞换成全站口径） */
const statusText = computed(() => {
  if (saving.value) return '保存中…'
  if (publishing.value) return '发布中…'
  if (saveError.value) return '保存失败'
  if (dirty.value) return '● 未保存'
  if (!savedAt.value) return '未改动'
  return `${saveKind.value === 'auto' ? '已自动保存' : '已保存'} ${savedAt.value}`
})

/**
 * 「查看」的地址。只在已发布时给得出，模板里就不必再对 `string | null` 做窄化
 * （`postKey` 要的是 `{ id: string }`，`postId` 是可空 ref，塞进模板会被 vue-tsc 拦下）。
 */
const viewHref = computed(() =>
  postId.value ? `/post/${postKey({ id: postId.value, slug: postSlug.value })}` : '',
)
const canView = computed(() => Boolean(postId.value) && status.value === 'published')
function goView(): void {
  if (!postId.value) return
  // 走 nav 层：那一条带「进文章」的闪白转场，与列表 / 标签栏进文章的手感一致
  void goArticle(postKey({ id: postId.value, slug: postSlug.value }))
}

/* ══════════════════════ 模态（面板 / 确认框 / 通告框） ══════════════════════ */

/** 二次确认框（删除 / 放弃改动这类不可逆动作） */
const confirmState = ref<{ text: string; ok: () => void } | null>(null)
/** 通告框（走 `machine/PixelDialog.vue`，打字机出字；EMPTY 时的「请先填标题」也走它） */
const noticeLines = ref<string[] | null>(null)

const anyModal = computed(() => panel.value !== null || confirmState.value !== null || noticeLines.value !== null)

/** 页内模态开着时告诉外壳：P / ESC / Q / E 一律让位（同一时刻只有一个模态） */
watch(
  anyModal,
  (open) => {
    pageModalOpen.value = open
  },
  { immediate: true },
)

/* ══════════════════════ 加载 ══════════════════════ */

function detailOf(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : String(err)
}

async function loadGroups(): Promise<void> {
  groupNote.value = ''
  try {
    groups.value = (await fetchGroups()) ?? []
  } catch (err) {
    groupNote.value = `分组没读到：${detailOf(err)}`
  }
}

async function loadDocs(): Promise<void> {
  docsState.value = 'loading'
  docsError.value = ''
  try {
    const res = await fetchMyPosts(100)
    myPosts.value = res?.items ?? []
    docsState.value = myPosts.value.length ? 'ready' : 'empty'
  } catch (err) {
    docsError.value = detailOf(err)
    docsState.value = 'error'
  }
}

/** 把一篇取回来的稿子填进表单（`fetchPost` 给的是完整模型，只有它带 `content`） */
function fill(post: Post): void {
  postId.value = post.id
  // slug 也一起收下：地址栏与 `currentKey()` 靠它对齐（`PostListItem` 带 slug，`Post` 也带）
  postSlug.value = post.slug ?? null
  title.value = post.title ?? ''
  content.value = post.content ?? ''
  tags.value = [...(post.tags ?? [])]
  cover.value = post.cover_image ?? null
  status.value = post.status === 'published' ? 'published' : 'draft'
  postGroupId.value = post.group_id ?? null
  if (post.group_id) activeGroupId.value = post.group_id
  snapshot.value = fingerprint()
  savedAt.value = ''
  saveError.value = ''
  // 进来就把光标放到正文尾部（继续写）；标题为空时先给标题
  void Promise.resolve().then(() => {
    if (!title.value) titleEl.value?.focus()
    else editorEl.value?.focus()
  })
}

/** 清空成一张新稿 */
function resetForm(): void {
  postId.value = null
  title.value = ''
  content.value = ''
  tags.value = []
  cover.value = null
  status.value = 'draft'
  postGroupId.value = activeGroupId.value || null
  snapshot.value = fingerprint()
  savedAt.value = ''
  saveError.value = ''
  void Promise.resolve().then(() => titleEl.value?.focus())
}

const loadError = ref('')

/** 按 URL 的 `key` 打开一篇（key = slug 优先、落回 id，与 `/post/:key` 同口径） */
async function openByKey(key: string): Promise<void> {
  loadError.value = ''
  // 列表里已经有这一篇时先按列表信息点亮（不等取详情，界面立刻有反应）
  try {
    const post = await fetchPost(key)
    fill(post)
  } catch (err) {
    loadError.value = `这篇稿子打不开：${detailOf(err)}`
    resetForm()
  }
}

/* ══════════════════════ 路由 ══════════════════════ */

const routeKey = computed(() => (typeof route.params.key === 'string' ? route.params.key : ''))

/** 当前稿子在 URL 里的名字（发布 / 新建后用它和路由比对，避免自己触发自己） */
function currentKey(): string {
  if (!postId.value) return ''
  return postSlug.value ?? postId.value ?? ''
}
const postSlug = ref<string | null>(null)

/**
 * 在写作页内部换一篇稿子 —— **只换数据，不换场景**。
 *
 * 为什么要显式声明 `none`：默认转场是整屏擦除，而这里前后是同一个写作页、
 * 连光标位置都还是用户的，套一层整屏闪白纯属噪音（`goPosts` 翻页也是这个口径）。
 * 只在真要写 URL 时才请求转场：`requestTransition` 存的是「下一次导航用哪种」，
 * 提前调而导航没发生，这个 `none` 会被后面某次无关导航吃掉。
 */
function pushWrite(path: string): void {
  requestTransition('none')
  void router.push(path)
}

/** 把 URL 换成当前稿子的 key（列表点选、新建后落库都要做，写在一处） */
function syncUrl(): void {
  const key = currentKey()
  const want = key ? `/write/${encodeURIComponent(key)}` : '/write'
  if (route.path === want) return
  requestTransition('none')
  void router.replace(want)
}

/**
 * URL → 表单。**URL 是唯一真相来源**（既有口径）：文稿面板里点一篇走的是
 * `router.push`，真正装载由这里完成。
 *
 * 这一页因此**不进 `App.vue` 的 `viewKey`**（见那边的 `SELF_LOADING_SCENES`）：
 * 靠 `:key` 重建组件也能换稿，但那样每换一篇都要把分组、文稿列表、标签
 * 全部重新拉一遍，而且刚保存完的「已保存 12:34:56」会在重建里被抹掉。
 */
watch(routeKey, (key) => {
  if (key === currentKey()) return
  scrollScreenTop()
  if (key) void openByKey(key)
  else resetForm()
})

/** `?group=<slug>` 指定目标分组（新建稿的入口） */
function applyQueryGroup(): void {
  const slug = typeof route.query.group === 'string' ? route.query.group : ''
  if (!slug) {
    activeGroupId.value = groups.value[0]?.id ?? ''
    return
  }
  const hit = groups.value.find((g) => g.id === slug || g.name === slug)
  if (hit) activeGroupId.value = hit.id
}

/* ══════════════════════ 保存 / 发布 ══════════════════════ */

/**
 * 存一次。
 *
 * `draft` 与 `published` 共用这一条路：契约另有 `POST /api/posts/{id}/publish`，
 * 但后端在 `PUT` 里已经处理了「draft → published 时补 `published_at`」，正文改动与
 * 状态切换能合并成一次请求（旧版也是这么做的），不为了用新端点把一次保存拆成两次往返。
 *
 * `auto` 只影响页头那行字：自动保存不该显示成「发布中…」（用户并没有按发布）。
 */
async function doSave(next: 'draft' | 'published', opts: { auto?: boolean } = {}): Promise<void> {
  if (busy.value) return
  const cleanTitle = title.value.trim() || '无标题'
  if (next === 'published' && !title.value.trim()) {
    playSfx('confirm')
    noticeLines.value = ['请先给这篇文章起个标题。', '标题会变成文章地址的一部分。']
    return
  }

  if (next === 'published' && !opts.auto) publishing.value = true
  else saving.value = true
  saveError.value = ''

  // 发出去的就是这一份。请求飞在路上时用户还能接着写（编辑区**故意不禁用**），
  // 所以「什么时候算干净」要以**发出去的那份**为准，而不是「回来时眼前的那份」。
  const sent = {
    title: cleanTitle,
    content: content.value,
    tags: [...tags.value],
    cover: cover.value,
    status: next,
    groupId: postGroupId.value,
  }
  /** 发出时屏幕上那个标题（空标题会被规范化成「无标题」，那不是「有东西没存」） */
  const titleAtSend = title.value

  try {
    const saved = postId.value
      ? await updatePost(postId.value, {
          title: sent.title,
          content: sent.content,
          tags: sent.tags,
          cover_image: sent.cover,
          status: sent.status,
          group_id: sent.groupId,
        })
      : await createPost({
          title: sent.title,
          content: sent.content,
          tags: sent.tags,
          cover_image: sent.cover,
          status: sent.status,
          group_id: sent.groupId,
        })
    postId.value = saved.id
    postSlug.value = saved.slug ?? null
    // 服务端回写的字段只在「这一项这段时间没被改过」时才落回本地：
    // 否则一次慢请求会把用户刚打进去的新标题覆盖成服务器上那份旧的。
    // 标题的判据是「跟发出时那份一样」——空标题那条路上 `title.value` 是空串而
    // `sent.title` 是「无标题」，两者不等，正好不去往输入框里塞一个「无标题」。
    if (title.value === titleAtSend || title.value === sent.title) {
      title.value = saved.title ?? title.value
    }
    // 状态**无条件**采纳：发布 / 存草稿本身就是由这次调用发起的状态切换，
    // 不是「用户的编辑」，拿它去比指纹只会让刚发布完的页面永远显示「未保存」，
    // 然后被自动保存用旧的 status 再推一次（发布完两秒自己变回草稿）。
    status.value = saved.status === 'published' ? 'published' : 'draft'
    if (postGroupId.value === sent.groupId) postGroupId.value = saved.group_id ?? sent.groupId
    saveKind.value = opts.auto ? 'auto' : 'manual'
    // 干净与否按发出那份算：飞行途中又写了，就仍然算脏（状态行会显示「未保存」，
    // 下面的 scheduleAutosave 会替它再排一次），绝不谎报「已保存」。
    snapshot.value = fingerprintOf({
      title: title.value === titleAtSend ? title.value : sent.title,
      content: sent.content,
      tags: sent.tags,
      cover: sent.cover,
      status: status.value,
      groupId: postGroupId.value === sent.groupId ? postGroupId.value : sent.groupId,
    })
    savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    // 新建之后地址栏要变成这一篇（旧版口径：能直接分享 / 刷新回来还在原稿）
    syncUrl()
    await loadDocs()
  } catch (err) {
    saveError.value = detailOf(err)
  } finally {
    saving.value = false
    publishing.value = false
    // 刚才被 busy 挡掉的那次自动保存（或者飞行途中新写的字）补排一次
    if (dirty.value) scheduleAutosave()
  }
}

const saveDraft = () => void doSave('draft')
const publish = () => void doSave('published')

/* ══════════════════════ 自动保存 ══════════════════════
 *
 * 两条路（旧版就是这么配的，不是新设计）：
 *   1. **停笔 2 秒**后存一次 —— 正常写作时走这条；
 *   2. **每 30 秒**兜一次 —— 一直不停手地写时，防抖计时器会被每个字符重置，
 *      光靠第 1 条可能几分钟都不落库（旧版的 `autoSaveInterval` 就是干这个的）。
 *
 * 只对**已落库**的稿子（有 id）自动保存：新稿自动建会给「打开写作页只是看看」
 * 的人也留下一地空稿（旧版同样只给已有文章自动保存，D6 的「不拦截离开」也以此为前提）。
 * 页头那行字会写成「已自动保存 12:34:56」。
 */
const AUTOSAVE_DEBOUNCE_MS = 2000
const AUTOSAVE_BACKSTOP_MS = 30000

let autoTimer = 0
function scheduleAutosave(): void {
  window.clearTimeout(autoTimer)
  if (!postId.value) return
  autoTimer = window.setTimeout(() => {
    // 正在存 / 发布：不插队，交给 `doSave` 的收尾再排（否则这一次就丢了）
    if (busy.value) return scheduleAutosave()
    if (dirty.value) void doSave(status.value, { auto: true })
  }, AUTOSAVE_DEBOUNCE_MS)
}

/** 兜底定时器：页面在的时候一直转，只对「已经脏了的已落库稿子」动手 */
const autoBackstop = window.setInterval(() => {
  if (!postId.value || busy.value || !dirty.value) return
  void doSave(status.value, { auto: true })
}, AUTOSAVE_BACKSTOP_MS)

// 六个字段里漏一个，那一项就永远不会自动保存（分组归属原先就漏了：改完分组不动别处 = 不落库）
watch([title, content, tags, cover, postGroupId, status], () => {
  scheduleAutosave()
})

onUnmounted(() => {
  window.clearTimeout(autoTimer)
  window.clearInterval(autoBackstop)
  pageModalOpen.value = false
  stop()
})

/* ══════════════════════ 标签 ══════════════════════ */

const tagInput = ref('')
/** 站上已有的标签（带篇数）——排序口径与 `stores/content.ts` 一致：`post_count` 倒序 */
const allTags = ref<{ name: string; post_count: number }[]>([])
/** 挑标签时高亮的那一枚（-1 = 没高亮，Enter 就是新建手打的那个词） */
const tagCursor = ref(-1)

async function loadTags(): Promise<void> {
  if (allTags.value.length) return
  try {
    const list = await fetchTags()
    allTags.value = (list ?? [])
      .map((t) => ({ name: t.name, post_count: t.post_count ?? 0 }))
      .sort((a, b) => b.post_count - a.post_count)
  } catch {
    // 标签建议是锦上添花：读不到就不给建议，输入框照常能用
    allTags.value = []
  }
}

/** 「从已有标签选」的候选：没打字给常用的 8 枚，打了字按包含过滤到 5 枚 */
const tagPicker = computed(() => {
  const q = tagInput.value.trim().toLowerCase()
  const pool = allTags.value.filter((t) => !tags.value.includes(t.name))
  if (!q) return pool.slice(0, 8)
  return pool.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 5)
})

// 候选换了（打字 / 加了一枚）就把高亮收回起点，免得 Enter 打在一枚已经不在列表里的标签上
watch([tagInput, tagPicker], () => {
  tagCursor.value = -1
})

function moveTagCursor(step: number): void {
  const last = tagPicker.value.length - 1
  if (last < 0) return
  const next = tagCursor.value + step
  tagCursor.value = next < 0 ? last : next > last ? 0 : next
}

function addTag(name = tagInput.value): void {
  const t = name.trim()
  if (!t || tags.value.includes(t)) {
    tagInput.value = ''
    return
  }
  tags.value = [...tags.value, t]
  tagInput.value = ''
  tagCursor.value = -1
}

/** 输入框里的 Enter / 「加」：高亮着哪一枚就收哪一枚，否则收手打的那个词（= 新建） */
function commitTag(): void {
  const pick = tagPicker.value[tagCursor.value]
  addTag(pick ? pick.name : tagInput.value)
}

function removeTag(name: string): void {
  tags.value = tags.value.filter((t) => t !== name)
}

/* ══════════════════════ 上传（封面 / 正文插图） ══════════════════════ */

const imageInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
const uploadNote = ref('')

function pickImage(): void {
  uploadNote.value = ''
  imageInput.value?.click()
}

/** 正文插图：上传完把 markdown 语法插到**光标处**（编辑器组件暴露的 `insertText`） */
async function onImagePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isImageFile(file)) {
    uploadNote.value = '只能上传图片文件'
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    uploadNote.value = '图片大小不能超过 10MB'
    return
  }
  uploadNote.value = '图片上传中…'
  try {
    const up = await uploadImage(file)
    editorEl.value?.insertText(`![${file.name}](${up.url})`)
    uploadNote.value = ''
  } catch (err) {
    uploadNote.value = detailOf(err)
  }
}

/** 封面：上传完直接落成 `cover_image`（保存时随 `PUT` 一起提交） */
async function onCoverPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isImageFile(file)) {
    uploadNote.value = '只能上传图片文件'
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    uploadNote.value = '图片大小不能超过 10MB'
    return
  }
  uploadNote.value = '封面上传中…'
  try {
    const up = await uploadImage(file)
    cover.value = up.url
    uploadNote.value = ''
  } catch (err) {
    uploadNote.value = detailOf(err)
  }
}

/* ══════════════════════ 文章操作（旧版右键菜单那四项） ══════════════════════ */

/** 重命名：标题框就在正文上方，把它当成重命名入口（不再弹第二个输入框） */
function renameDoc(): void {
  if (!postId.value) return
  closePanel()
  void Promise.resolve().then(() => {
    titleEl.value?.focus()
    titleEl.value?.select()
  })
}

/** 复制：另存一篇草稿，标题加「(复制)」（后缀照旧版 `duplicatePost`） */
async function duplicateDoc(): Promise<void> {
  if (!postId.value || busy.value) return
  saving.value = true
  saveError.value = ''
  try {
    const created = await createPost({
      title: `${title.value || '无标题'} (复制)`,
      content: content.value,
      tags: tags.value,
      cover_image: cover.value,
      status: 'draft',
      group_id: postGroupId.value,
    })
    await loadDocs()
    closePanel()
    playSfx('confirm')
    postSlug.value = created.slug ?? null
    fill(created)
    syncUrl()
  } catch (err) {
    saveError.value = detailOf(err)
  } finally {
    saving.value = false
  }
}

/** 删除：二次确认（页内模态）→ `DELETE /api/posts/{id}` → 回到一张新稿 */
function askDelete(): void {
  if (!postId.value) return
  playSfx('confirm')
  closePanel()
  confirmState.value = {
    text: `删除《${title.value || '无标题'}》？这一步不可撤销。`,
    ok: () => void runDelete(),
  }
}

async function runDelete(): Promise<void> {
  const id = postId.value
  confirmState.value = null
  if (!id) return
  saving.value = true
  try {
    await deletePost(id)
    await loadDocs()
    postSlug.value = null
    resetForm()
    syncUrl()
  } catch (err) {
    saveError.value = detailOf(err)
  } finally {
    saving.value = false
  }
}

/** 移动（换分组）：直接写 `group_id`，保存时随 `PUT` 提交 */
function moveToGroup(id: string): void {
  postGroupId.value = id || null
}

/** 新建分组（面板内就地输入） */
async function runCreateGroup(): Promise<void> {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    const created = await createGroup(name)
    newGroupName.value = ''
    newGroupOpen.value = false
    await loadGroups()
    activeGroupId.value = created.id
    postGroupId.value = created.id
    if (!postId.value) snapshot.value = fingerprint()
  } catch (err) {
    groupNote.value = detailOf(err)
  }
}

/* ══════════════════════ 面板开关 ══════════════════════ */

const titleEl = ref<HTMLInputElement | null>(null)
const editorEl = ref<InstanceType<typeof MarkdownSourceEditor> | null>(null)
/** 窄屏预览面板的滚动容器（`tabindex="0"`，开面板时把原生焦点交给它，方向键才滚它） */
const previewBody = ref<HTMLElement | null>(null)

function openPanel(which: Panel): void {
  playSfx('confirm')
  panel.value = which
  // 焦点环回到第一格：上一次开面板留下的索引可能已经越界（列表被过滤短了）
  if (which === 'docs') docsFocus.set(0, true)
  if (which === 'meta') metaFocus.set(0, true)
  if (which === 'meta') void loadTags()
  if (which === 'preview') {
    // 预览面板的焦点**不**收回外壳：它是只读的滚动容器，原生焦点落在它身上，
    // 方向键 / PageUp / PageDown / 空格才走浏览器自己的滚动（见 `panelPad` 那一支）
    void nextTick(() => previewBody.value?.focus())
    return
  }
  // 另两个面板是自绘焦点的（不是原生焦点），进来先把焦点交给外壳
  dropNativeFocus()
}

/**
 * 动作条上那颗按钮的点击：**同一个面板再点一下就关**，与键盘的同一颗键同义
 * （`panelPad` 里写的是「同一个面板键再按一下也是关」）。
 * 不直接改 `openPanel` 的原因是它另有调用点（面板键切换、开资料时顺手拉标签），
 * 那些地方要的是「打开」，不是「切换」。
 */
function pickPanel(which: Panel): void {
  if (panel.value === which) closePanel()
  else openPanel(which)
}

function closePanel(): void {
  if (!panel.value) return
  panel.value = null
  // 焦点可能正落在预览体上：面板一卸载那个节点就没了，焦点会掉到 `body` ——
  // 键盘事件只沿当前焦点的祖先链冒泡，掉到 body 之后整块键盘当场失灵（§21 同一条坑）
  focusShellRoot()
}

/** 同一个键再按一下 = 关（`N` / `M` / `V`） */
const PANEL_KEY: Partial<Record<PadAction, Panel>> = {
  panelDocs: 'docs',
  panelMeta: 'meta',
  panelPreview: 'preview',
}

/* ══════════════════════ 键盘 ══════════════════════ */

const docsFocus = useFocusGroup({ initial: 0 })
const metaFocus = useFocusGroup({ initial: 0 })
const confirmFocus = useFocusGroup({ initial: 0 })

/** 文稿面板的焦点环：第 0 格是「新建文章」，之后是当前分组的篇目 */
const docsRingCount = computed(() => docsInGroup.value.length + 1)

/** 资料面板的焦点环：重命名 / 复制 / 删除（新稿上这三件事无处可做） */
const META_ACTS = ['重命名', '复制', '删除'] as const
const META_BUTTONS = META_ACTS.length

function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  focusShellRoot()
}

function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

/** Q：历史后退；深链接直接进来时兜底回主页（与用户档案页 / 外链管理页同源） */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/** 面板里选中第 0 格 = 新建文章 */
function newDoc(): void {
  closePanel()
  postSlug.value = null
  resetForm()
  syncUrl()
}

/** 面板里选中某一篇 */
function openDoc(post: PostListItem): void {
  closePanel()
  // 已经就是这一篇：不跳
  if (postId.value === post.id) return
  // ⚠️ 这里**不预先写 `postSlug`**：`currentKey()` 读的就是它，先写就等于
  //    「地址还没变，`currentKey()` 已经是目标值」，下面那个 watcher 会当场短路、
  //    稿子永远装不进来。slug 由 `fill()` 在详情取回来之后收下（真值只有一处）。
  pushWrite(`/write/${encodeURIComponent(postKey(post))}`)
}

function runDocsAct(): boolean {
  const i = docsFocus.index.value
  if (i === 0) {
    newDoc()
    return true
  }
  const post = docsInGroup.value[i - 1]
  if (!post) return false
  openDoc(post)
  return true
}

function runMetaAct(): boolean {
  if (!postId.value) return false
  runMetaByIndex(metaFocus.index.value)
  return true
}

/** 「文章操作」那一行三颗按钮的唯一派发点（键盘走 `runMetaAct`，鼠标走模板 @click） */
function runMetaByIndex(i: number): void {
  if (!postId.value) return
  const act = META_ACTS[i]
  if (act === '重命名') renameDoc()
  else if (act === '复制') void duplicateDoc()
  else if (act === '删除') askDelete()
}

/** 确认框的两颗按钮（键盘与鼠标共用，模板里不写字面量表达式） */
function confirmCancel(): void {
  confirmState.value = null
}
function confirmOk(): void {
  confirmState.value?.ok()
}

/** 确认框的按键归属（0 = 取消，1 = 确定；ESC / Q 都当取消） */
function confirmPad(a: PadAction): boolean {
  if (a === 'cancel' || a === 'back') {
    confirmCancel()
    return true
  }
  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    if (confirmFocus.index.value === 0) confirmCancel()
    else confirmOk()
    return true
  }
  if (a === 'left' || a === 'right') {
    const next = spatialIndex(confirmFocus.index.value, a, 2, 2)
    if (next === null) return false
    dropNativeFocus()
    confirmFocus.set(next)
    return true
  }
  return false
}

/** 面板里的按键归属 */
function panelPad(a: PadAction, which: Panel): boolean {
  // 页内模态：ESC / Q 关掉自己（先例与理由见文件头）。同一个面板键再按一下也是关。
  if (a === 'cancel' || a === 'back') {
    closePanel()
    return true
  }
  if (PANEL_KEY[a] === which) {
    closePanel()
    return true
  }
  // 换到另一个面板：直接切，不要求先关。
  // 焦点口径必须跟着走（预览 → 文稿时焦点还停在马上要被卸载的预览体上，
  // 不收回外壳那一下键盘就掉线了），所以切面板复用 `openPanel` 那一套，不另写一份。
  if (PANEL_KEY[a]) {
    openPanel(PANEL_KEY[a] as Panel)
    return true
  }

  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    if (which === 'docs') return runDocsAct()
    if (which === 'meta') return runMetaAct()
    return false
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 预览面板：没有可选项，方向键整个交给浏览器。
    // **先于 `dropNativeFocus()` 返回** —— 开放面板时焦点就在这个滚动容器上（`openPanel`），
    // 收掉它方向键就没有滚动目标了，正文一长照样滚不动（§28.12）。
    if (which === 'preview') return false
    dropNativeFocus()
    if (which === 'docs') {
      const next = spatialIndex(docsFocus.index.value, a, 1, docsRingCount.value)
      if (next === null) return false
      docsFocus.set(next)
      return true
    }
    if (which === 'meta') {
      const next = spatialIndex(metaFocus.index.value, a, META_BUTTONS, META_BUTTONS)
      if (next === null) return false
      metaFocus.set(next)
      return true
    }
    // 预览在上面已经返回；这里兜底（新增面板时别漏掉焦点口径）
    return false
  }

  return false
}

const off = onPad((a) => {
  if (confirmState.value) return confirmPad(a)
  if (panel.value) return panelPad(a, panel.value)

  if (a === 'back') {
    back()
    return true
  }

  // 基础态**不消费** ESC：全站口径是它呼出菜单，页面抢走就等于把菜单入口堵死
  // （编辑框里的 ESC 由内核拦下做「失焦」，到不了这里；见文件头的输入模型）
  if (a === 'cancel') return false

  // 三个面板键：焦点不在编辑框里时是 N / M / V，在正文里是 Shift+N / Shift+M / Shift+V
  // （组合键白名单就在这几个动作上，见 `input/pad.ts` 的 `COMBO_ACTIONS`）
  const which = PANEL_KEY[a]
  if (which) {
    if (which === 'preview' && !narrow.value) return false
    openPanel(which)
    return true
  }

  if (a === 'confirm') {
    // 焦点在真实按钮 / 输入框上时回车归浏览器（惯例三）
    if (nativeOwnsEnter()) return false
    return false
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 惯例二：方向键一动就收掉原生焦点，屏幕上永远只有一个光标。
    // 正文里的方向键根本到不了这里（可编辑目标被内核让开，组合键白名单里也没有它），
    // 所以这里说的是「焦点停在按钮上」那条路径：收掉它，然后把按键还给浏览器滚动页面。
    dropNativeFocus()
    return false
  }

  return false
})
onUnmounted(off)

/* ══════════════════════ 窄屏（预览折叠成面板） ══════════════════════ */

const narrow = ref(false)
let mq: MediaQueryList | null = null

function onMqChange(event: MediaQueryListEvent): void {
  narrow.value = event.matches
  if (!event.matches && panel.value === 'preview') panel.value = null
}

onMounted(async () => {
  scrollScreenTop()
  mq = window.matchMedia('(max-width: 1100px)')
  narrow.value = mq.matches
  mq.addEventListener('change', onMqChange)

  await Promise.all([loadGroups(), loadDocs()])
  if (routeKey.value) await openByKey(routeKey.value)
  else {
    applyQueryGroup()
    resetForm()
  }
})

onUnmounted(() => {
  mq?.removeEventListener('change', onMqChange)
  mq = null
})
</script>

<template>
  <div class="write">
    <SceneHead title="写作 · WRITE" :clock="clock">
      <span class="save-note px" :class="{ 'is-dirty': dirty, 'is-bad': !!saveError }" data-testid="write-status">
        {{ statusText }}
      </span>
    </SceneHead>

    <!-- 页面自带可见一级标题（`App.vue` 的 SELF_TITLED_SCENES 里有 write，外壳不发隐藏 h1） -->
    <h1 class="page-title px px-36 px-display">写作台</h1>

    <!-- 面板与动作条：鼠标路径与键盘路径共用同一批按钮 -->
    <div class="write-bar px">
      <button
        type="button"
        class="bar-btn"
        data-testid="write-open-docs"
        title="文稿（N）"
        @click="pickPanel('docs')"
      >
        文稿 <i class="kbd">N</i>
      </button>
      <button
        type="button"
        class="bar-btn"
        data-testid="write-open-meta"
        title="资料（M）"
        @click="pickPanel('meta')"
      >
        资料 <i class="kbd">M</i>
      </button>
      <button
        v-if="narrow"
        type="button"
        class="bar-btn"
        data-testid="write-open-preview"
        title="预览（V）"
        @click="pickPanel('preview')"
      >
        预览 <i class="kbd">V</i>
      </button>

      <span class="bar-group px">
        <span class="bar-chip">{{ activeGroup ? activeGroup.name : '全部' }}</span>
        <span class="bar-chip">{{ status === 'published' ? '已发布' : '草稿' }}</span>
      </span>

      <span class="bar-tail">
        <a
          v-if="canView"
          class="bar-btn"
          data-testid="write-view"
          :href="viewHref"
          @click.prevent="goView()"
        >
          查看
        </a>
        <button type="button" class="bar-btn" :disabled="busy" data-testid="write-save" @click="saveDraft()">
          存草稿
        </button>
        <button
          type="button"
          class="bar-btn is-primary"
          :disabled="busy"
          data-testid="write-publish"
          @click="publish()"
        >
          {{ status === 'published' ? '更新' : '发布' }}
        </button>
      </span>
    </div>

    <p v-if="loadError" class="note px is-bad" data-testid="write-load-error">{{ loadError }}</p>
    <p v-if="uploadNote" class="note px">{{ uploadNote }}</p>

    <!-- 标题（单行；「重命名」就是把焦点交给它） -->
    <label class="title-row">
      <span class="sr-only">文章标题</span>
      <input
        ref="titleEl"
        v-model="title"
        class="title-input px"
        type="text"
        placeholder="文章标题"
        data-testid="write-title"
      />
    </label>

    <!-- 正文：宽屏左源码右预览；窄屏只有源码，预览走面板 -->
    <!-- 栅格列数必须跟 `narrow` 同源：窄屏下预览那一栏从 DOM 里拿掉了，
         若 `.write-split` 还留着两列，源码就只剩左半屏、右半屏空着（实测 900 下只有 403px/818px）。 -->
    <div class="write-split" :class="{ 'is-narrow': narrow }">
      <!-- 不把 `busy` 传给编辑器：那会 `disabled` 掉 textarea，自动保存每 2 秒把光标打断一次。
           编辑区任何时候都能写；「保存中」只体现为动作条按钮禁用 + 页头那行字。 -->
      <MarkdownSourceEditor
        ref="editorEl"
        v-model="content"
        class="split-source"
        @save="saveDraft()"
        @publish="publish()"
        @image="pickImage()"
      />

      <!-- 预览是只读的：inert 让它整片退出 Tab 焦点链，
           否则预览里的链接会接走焦点，用户在编辑区按 Tab 会「跳丢」在右半边 -->
      <aside v-if="!narrow" class="split-preview" data-testid="write-preview" inert>
        <div class="preview-head px">预览</div>
        <div class="preview-body">
          <MarkdownBody :source="content" />
        </div>
      </aside>
    </div>

    <div class="keybar px">
      <span class="kb"><i class="kbd">TAB</i> 出正文</span>
      <span class="kb"><i class="kbd">ESC</i> 失焦</span>
      <span class="kb"><i class="kbd">Shift</i>+<i class="kbd">N</i> 文稿</span>
      <span class="kb"><i class="kbd">Shift</i>+<i class="kbd">M</i> 资料</span>
      <span class="kb" v-if="narrow"><i class="kbd">Shift</i>+<i class="kbd">V</i> 预览</span>
      <span class="kb"><i class="kbd">Ctrl</i>+<i class="kbd">S</i> 存草稿</span>
      <span class="kb"><i class="kbd">Ctrl</i>+<i class="kbd">↵</i> 发布</span>
      <span class="kb tail"><i class="kbd">Q</i> 返回 · <i class="kbd">P</i> 菜单</span>
    </div>

    <!-- ══════════ 覆盖面板 ══════════ -->
    <div v-if="panel" class="sheet-mask" @click.self="closePanel()">
      <section
        class="sheet px"
        :class="`is-${panel}`"
        role="dialog"
        aria-modal="true"
        :aria-label="PANEL_TITLE[panel]"
        :data-testid="`write-panel-${panel}`"
      >
        <header class="sheet-head">
          <h2 class="sheet-title">{{ PANEL_TITLE[panel] }}</h2>
          <button type="button" class="bar-btn" data-testid="write-panel-close" @click="closePanel()">
            ✕ 关闭
          </button>
        </header>

        <!-- ── 文稿 ── -->
        <template v-if="panel === 'docs'">
          <div class="sheet-row">
            <button
              type="button"
              class="chip"
              :class="{ on: activeGroupId === '' }"
              data-testid="write-group-all"
              @click="activeGroupId = ''"
            >
              全部
            </button>
            <button
              v-for="g in groups"
              :key="g.id"
              type="button"
              class="chip"
              :class="{ on: g.id === activeGroupId }"
              :data-testid="`write-group-${g.id}`"
              @click="activeGroupId = g.id"
            >
              {{ g.name }}
            </button>
            <button
              type="button"
              class="chip is-add"
              data-testid="write-group-new"
              @click="newGroupOpen = !newGroupOpen"
            >
              ＋ 新建分组
            </button>
          </div>

          <div v-if="newGroupOpen" class="sheet-row">
            <input
              v-model="newGroupName"
              class="field px"
              type="text"
              placeholder="分组名"
              aria-label="新分组名"
              data-testid="write-group-name"
              @keydown.enter.prevent="runCreateGroup()"
            />
            <button type="button" class="chip" data-testid="write-group-create" @click="runCreateGroup()">
              建
            </button>
          </div>
          <p v-if="groupNote" class="note px is-bad">{{ groupNote }}</p>

          <div class="sheet-row">
            <button
              type="button"
              class="tab"
              :class="{ on: docsTab === 'published' }"
              data-testid="write-tab-published"
              @click="docsTab = 'published'"
            >
              文章 {{ countIn('published') }}
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: docsTab === 'draft' }"
              data-testid="write-tab-draft"
              @click="docsTab = 'draft'"
            >
              草稿 {{ countIn('draft') }}
            </button>
          </div>

          <p v-if="docsState === 'loading'" class="note px">读取中…</p>
          <p v-else-if="docsState === 'error'" class="note px is-bad">文稿读不到：{{ docsError }}</p>

          <ul class="doc-list">
            <li>
              <button
                type="button"
                class="doc focusable"
                :class="{ 'is-focused': docsFocus.index.value === 0 }"
                data-testid="write-doc-new"
                @click="newDoc()"
                @mouseenter="docsFocus.hover(0)"
              >
                <span class="doc-title">＋ 新建文章</span>
              </button>
            </li>
            <li v-for="(d, i) in docsInGroup" :key="d.id">
              <button
                type="button"
                class="doc focusable"
                :class="{ 'is-focused': docsFocus.index.value === i + 1, on: d.id === postId }"
                :data-testid="`write-doc-${d.id}`"
                @click="openDoc(d)"
                @mouseenter="docsFocus.hover(i + 1)"
              >
                <span class="doc-state" :class="d.status">{{ d.status === 'draft' ? '草' : '发' }}</span>
                <span class="doc-title">{{ d.title || '无标题' }}</span>
                <span class="doc-meta">{{ shortDate(d.created_at) }}</span>
              </button>
            </li>
          </ul>
          <p v-if="docsState !== 'loading' && docsInGroup.length === 0" class="note px">
            {{ docsTab === 'draft' ? '这个分组还没有草稿。' : '这个分组还没有已发布的文章。' }}
          </p>
        </template>

        <!-- ── 资料 ── -->
        <template v-else-if="panel === 'meta'">
          <section class="meta-block">
            <h3 class="meta-h">标签</h3>
            <div class="tag-row">
              <span v-for="t in tags" :key="t" class="tag">
                {{ t }}
                <button
                  type="button"
                  class="tag-x"
                  :aria-label="`移除标签 ${t}`"
                  :data-testid="`write-tag-remove-${t}`"
                  @click="removeTag(t)"
                >
                  ✕
                </button>
              </span>
              <input
                v-model="tagInput"
                class="field px is-small"
                type="text"
                placeholder="加标签…"
                aria-label="给文章加标签"
                data-testid="write-tag-input"
                @focus="loadTags()"
                @keydown.enter.prevent="commitTag()"
                @keydown.down.prevent="moveTagCursor(1)"
                @keydown.up.prevent="moveTagCursor(-1)"
              />
              <button type="button" class="chip" data-testid="write-tag-add" @click="commitTag()">加</button>
            </div>

            <!-- 已有标签的口子：输入框空着时给「常用的几枚」，打字时按包含过滤。
                 光靠手打，站上已有的同义标签会越攒越乱（旧版也只有「打字才出建议」这一层）。 -->
            <div v-if="tagPicker.length" class="tag-suggest" data-testid="write-tag-suggest">
              <span class="tag-suggest-note">{{ tagInput.trim() ? '匹配到' : '从已有标签选' }}</span>
              <button
                v-for="(s, i) in tagPicker"
                :key="s.name"
                type="button"
                class="chip"
                :class="{ on: i === tagCursor }"
                :data-testid="`write-tag-suggest-${s.name}`"
                @mouseenter="tagCursor = i"
                @click="addTag(s.name)"
              >
                {{ s.name }}<i class="tag-count">{{ s.post_count }}</i>
              </button>
            </div>
            <p v-else-if="tagInput.trim()" class="meta-note">
              按 <i class="kbd">Enter</i> 新建「{{ tagInput.trim() }}」
            </p>
          </section>

          <section class="meta-block">
            <h3 class="meta-h">封面</h3>
            <div v-if="cover" class="cover">
              <img :src="cover" alt="封面" class="img-frame" />
              <button type="button" class="chip" data-testid="write-cover-remove" @click="cover = null">
                移除封面
              </button>
            </div>
            <button v-else type="button" class="chip" data-testid="write-cover-pick" @click="coverInput?.click()">
              上传封面
            </button>
          </section>

          <section class="meta-block">
            <h3 class="meta-h">分组归属</h3>
            <select
              class="field px"
              :value="postGroupId ?? ''"
              aria-label="分组归属"
              data-testid="write-group-select"
              @change="moveToGroup(($event.target as HTMLSelectElement).value)"
            >
              <option value="">未分组</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </section>

          <section class="meta-block">
            <h3 class="meta-h">文章操作</h3>
            <div class="meta-acts">
              <button
                v-for="(act, i) in META_ACTS"
                :key="act"
                type="button"
                class="chip focusable"
                :class="{ 'is-focused': metaFocus.index.value === i, 'is-danger': act === '删除' }"
                :disabled="!postId"
                :data-testid="`write-act-${i}`"
                @mouseenter="metaFocus.hover(i)"
                @click="runMetaByIndex(i)"
              >
                {{ act }}
              </button>
            </div>
            <p v-if="!postId" class="note px">新稿还没有存过，重命名 / 复制 / 删除要等第一次保存之后。</p>
          </section>
        </template>

        <!-- ── 预览（窄屏） ──
             `inert` 只挂里面那层包装，**不挂滚动容器自己**：inert 元素不参与命中测试，
             挂在容器上滚轮就再也落不到它身上，正文一长就滚不动（真机实测，见 §28.12）。
             容器自己 `tabindex="0"`（与审计页那个可滚动原文框同一写法）：开面板时把原生焦点
             交给它，方向键 / PageUp / PageDown / 空格才走浏览器原生滚动。 -->
        <template v-else>
          <div
            ref="previewBody"
            class="preview-body is-sheet"
            tabindex="0"
            role="group"
            aria-label="预览正文（只读，可滚动）"
            data-testid="write-preview-body"
          >
            <div class="preview-inert" inert>
              <MarkdownBody :source="content" />
            </div>
          </div>
        </template>
      </section>
    </div>

    <!-- ══════════ 二次确认（页内模态） ══════════ -->
    <div v-if="confirmState" class="sheet-mask" @click.self="confirmCancel()">
      <section class="confirm px" role="dialog" aria-modal="true" aria-label="请确认" data-testid="write-confirm">
        <p class="confirm-text">{{ confirmState.text }}</p>
        <div class="confirm-acts">
          <button
            type="button"
            class="chip focusable"
            :class="{ 'is-focused': confirmFocus.index.value === 0 }"
            data-testid="write-confirm-cancel"
            @mouseenter="confirmFocus.hover(0)"
            @click="confirmCancel()"
          >
            取消
          </button>
          <button
            type="button"
            class="chip is-danger focusable"
            :class="{ 'is-focused': confirmFocus.index.value === 1 }"
            data-testid="write-confirm-ok"
            @mouseenter="confirmFocus.hover(1)"
            @click="confirmOk()"
          >
            确定
          </button>
        </div>
      </section>
    </div>

    <!-- ══════════ 通告（打字机，走外壳同款对话组件） ══════════ -->
    <PixelDialog
      v-if="noticeLines"
      speaker="写作台"
      :lines="noticeLines"
      @done="noticeLines = null"
      @close="noticeLines = null"
    />

    <!-- 两个隐藏的文件选择器：只由页面按钮用 .click() 唤起（键盘路径走那两颗按钮）。
         tabindex="-1" 是必须的 —— 它们是可见性为 0 的 input，能被原生 Tab 停靠，
         键盘用户会看到焦点"消失"一下（正文尾部按 Tab 就会撞上）。
         正文里的 Tab 已被 `MarkdownSourceEditor` 接去插入条，这里再堵上最后的漏洞。 -->
    <input
      ref="imageInput"
      class="sr-file"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-label="选择正文图片"
      data-testid="write-image-input"
      @change="onImagePicked"
    />
    <input
      ref="coverInput"
      class="sr-file"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-label="选择封面图片"
      data-testid="write-cover-input"
      @change="onCoverPicked"
    />
  </div>
</template>

<style scoped>
.write {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 0;
  gap: 10px;
}

.page-title {
  margin: 0;
  color: var(--blue-700);
  font-size: var(--px-lg);
}

.save-note {
  color: var(--ink-soft);
}

.save-note.is-dirty {
  color: var(--blue-600);
}

.save-note.is-bad,
.note.is-bad {
  color: var(--spark);
}

/* ── 动作条 ── */
/*
 * 动作条**抬在面板遮罩之上**（用户裁决：鼠标换面板不该比键盘多点一下）。
 *
 * 原先它与页面其余部分一样被 `.sheet-mask`（`fixed` + `z-index: 200`）盖住，
 * 于是「已经有面板开着时点另一颗面板按钮」第一下点到的是遮罩——那一层只负责关，
 * 要点第二下才真的打开；而键盘按 M 是**直接切**（`panelPad`：换面板不要求先关）。
 * 两边行为不一致，也不好解释。抬到 201 之后鼠标也一下切到，`pickPanel` 再让
 * 「点同一个」等价于键盘的「再按一下就是关」。
 *
 * 代价：面板开着时动作条不再被遮罩压暗（它本来就是那颗开关，留着更合理）。
 */
.write-bar {
  position: relative;
  z-index: 201;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border: 3px solid var(--blue-300);
  background: var(--blue-100);
  padding: 7px 9px;
}

.bar-btn {
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 3px 9px;
  cursor: pointer;
  text-decoration: none;
}

.bar-btn:hover {
  background: var(--blue-200);
}

.bar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bar-btn.is-primary {
  background: var(--blue-500);
  color: var(--paper);
  border-color: var(--blue-600);
}

.bar-group {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.bar-chip {
  font-size: 12px;
  color: var(--blue-600);
  border: 2px dashed var(--blue-300);
  padding: 2px 7px;
}

.bar-tail {
  margin-left: auto;
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.note {
  margin: 0;
  font-size: 12px;
  color: var(--ink-soft);
}

/* ── 标题 ── */
.title-row {
  display: block;
}

.title-input {
  width: 100%;
  font-family: 'ArkPixel', 'Noto Sans Mono', monospace;
  font-size: var(--px-md);
  color: var(--ink);
  background: var(--paper);
  border: 3px solid var(--blue-300);
  padding: 8px 10px;
  outline: none;
}

.title-input:focus {
  border-color: var(--blue-500);
}

/* ── 正文 / 预览分屏 ── */
.write-split {
  flex: 1 1 auto;
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

/* 窄屏（`narrow` 为真、预览改成覆盖面板）：一列到底，源码独占全宽 */
.write-split.is-narrow {
  grid-template-columns: minmax(0, 1fr);
}

.split-source,
.split-preview {
  min-height: 0;
  min-width: 0;
}

.split-preview {
  display: flex;
  flex-direction: column;
  border: 3px solid var(--blue-300);
  background: var(--paper);
}

.preview-head {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--blue-700);
  background: var(--blue-100);
  border-bottom: 3px solid var(--blue-300);
  padding: 4px 8px;
}

.preview-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.preview-body.is-sheet {
  padding: 0;
}

/* ── 键位提示 ── */
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

/* ── 覆盖面板 / 二次确认（页内模态，同一张遮罩） ──
   位置口径抄 `AdminLinksView` 的 `.del-mask`（P5 已定稿的页内模态先例）：fixed 铺满视口。
   不用 absolute —— `.screen-inner` 是可滚动容器，absolute 的 inset:0 会跟着内容滚走，
   正文一长就只剩半张遮罩。遮罩盖住 `.deck` 属页内模态的正常代价，关门即恢复。 */
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--veil-deep);
  display: grid;
  place-items: center;
  padding: 20px;
}

.sheet {
  width: min(720px, 100%);
  max-height: 100%;
  overflow-y: auto;
  background: var(--paper);
  border: 4px solid var(--edge);
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet.is-docs {
  width: min(620px, 100%);
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
}

.sheet-title {
  margin: 0;
  font-size: var(--px-md);
  color: var(--blue-700);
}

.sheet-head .bar-btn {
  margin-left: auto;
}

.sheet-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip,
.tab {
  font: inherit;
  font-size: 12px;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 2px 8px;
  cursor: pointer;
}

.chip:hover,
.tab:hover {
  background: var(--blue-200);
}

.chip.on,
.tab.on {
  background: var(--blue-500);
  color: var(--paper);
  border-color: var(--blue-600);
}

.chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chip.is-danger {
  border-color: var(--spark);
  color: var(--spark);
}

.field {
  font: inherit;
  font-size: 12px;
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--blue-400);
  padding: 3px 6px;
  outline: none;
}

.field.is-small {
  width: 120px;
}

/* ── 篇目列表 ── */
.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc {
  font: inherit;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--blue-300);
  padding: 5px 8px;
  cursor: pointer;
}

.doc:hover {
  background: var(--blue-100);
}

.doc.on {
  border-color: var(--blue-600);
  background: var(--blue-100);
}

.doc-state {
  flex: 0 0 auto;
  font-size: 11px;
  border: 1.5px solid var(--blue-400);
  color: var(--blue-600);
  padding: 0 4px;
}

.doc-state.draft {
  border-color: var(--ink-faint);
  color: var(--ink-faint);
}

.doc-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.doc-meta {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--ink-faint);
}

/* ── 资料面板 ── */
.meta-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 2px dashed var(--blue-200);
  padding-top: 8px;
}

.meta-block:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.meta-h {
  margin: 0;
  font-size: 12px;
  color: var(--blue-600);
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  background: var(--blue-100);
  border: 2px solid var(--blue-300);
  color: var(--blue-700);
  padding: 1px 4px 1px 6px;
}

.tag-x {
  font: inherit;
  font-size: 11px;
  background: none;
  border: 0;
  color: var(--blue-600);
  cursor: pointer;
  padding: 0 2px;
}

.tag-suggest {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.tag-suggest-note {
  font-size: 12px;
  color: var(--ink-faint);
}

/* 高亮的那一枚与面板里自绘的焦点环同一套视觉（`.chip.on` 就是被选中态） */
.tag-suggest .chip.on {
  background: var(--blue-500);
  border-color: var(--blue-600);
  color: var(--paper);
}

.tag-count {
  font-style: normal;
  font-size: 11px;
  margin-left: 4px;
  opacity: 0.75;
}

.meta-note {
  font-size: 12px;
  color: var(--ink-faint);
  margin: 0;
}

.cover {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cover img {
  width: 140px;
  height: 84px;
  object-fit: cover;
}

.meta-acts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── 确认框 ── */
.confirm {
  width: min(520px, 100%);
  background: var(--paper);
  border: 4px solid var(--ink);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.confirm-text {
  margin: 0;
  font-size: 14px;
  color: var(--ink);
}

.confirm-acts {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 视觉隐藏：屏幕阅读器用的一级标签与文件选择器（与外壳 `.sr-heading` 同一套写法） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
