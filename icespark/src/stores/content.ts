import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError } from '@/api/client'
import { fetchComments } from '@/api/comments'
import { fetchGroups } from '@/api/groups'
import { fetchLinks } from '@/api/links'
import { fetchPost, fetchPosts } from '@/api/posts'
import { fetchStats } from '@/api/stats'
import { fetchTags } from '@/api/tags'
import type { Comment, Group, Link, Post, PostListItem, Stats, Tag } from '@/api/types'

/**
 * 内容 store（pinia setup store，id `content`；架构 §16.2 冻结接口）。
 *
 * 为什么用 store 而不是模块级 ref：样机 `data/api.ts` 里的 `store` 是裸 ref 对象，
 * 首页 / 列表页 / 文章页 / 外链页共享同一份数据；搬进生产就用 pinia 承接
 * （与 `stores/site.ts` 同一套机制）。唯一机械改写：样机写 `store.x.value`，
 * 生产写 `store.x` —— 其余访问形状不变。
 *
 * 三态 `dataSource`：`'loading'` 首屏还没有结果 / `'live'` 接口命中 /
 * `'demo'` **接口没命中，页面按空数据渲染**。样机里 demo 的意思是「显示内置样张」，
 * 正式版没有样张（§16.2 明确不迁 `DEMO_*` 常量），所以 demo 只剩「这份数据不是真的」
 * 这一层含义。
 *
 * **加载失败一律不抛到界面上**（有意如此）：内容接口挂了应该表现为「没有内容」——
 * state 落成空数组 / 空对象，页面按空态渲染，而不是整页白屏或弹一个用户看不懂的错误；
 * 底栏与开机自检照样机读 `dataSource === 'live' ? '● LIVE' : '○ DEMO'`（文案一字不改），
 * 用户仍能一眼看出当前不是真数据。
 */
export const useContentStore = defineStore('content', () => {
  // ── 对外状态：名字与类型与样机 `store` 同名同型（§16.2） ──

  const posts = ref<PostListItem[]>([])
  const total = ref(0)
  /** 样机初始值是 DEMO_STATS(3/6/88)；正式版没有样张，退化为 0，接口回来再覆盖 */
  const stats = ref<Stats>({ agent_count: 0, post_count: 0, total_views: 0 })
  const post = ref<Post | null>(null)

/**
 * 正文为什么是空的（用户裁决 §58）：`null` = 正常 / 还没读完，
 * `'missing'` = 这篇文章不存在（HTTP 404），`'error'` = 其它失败（后端不可达 / 接口出错）。
 * 页面据此给**页内空态 + 两个动作**，而不是永远停在「读取正文 …」。
 */
const postError = ref<'missing' | 'error' | null>(null)
  const comments = ref<Comment[]>([])
  const groups = ref<Group[]>([])
  const tags = ref<Tag[]>([])
  const links = ref<Link[]>([])

  /**
   * 在飞的请求数。
   * 为什么是计数器而不是布尔量：首屏会并发发好几个请求（外壳拉 stats，场景再拉
   * posts / groups / tags），布尔量会被「先回来的那个」提前关掉，
   * 于是 `loading` 会退化成「有没有请求发生过」，而不是「现在有没有请求在飞」。
   */
  const pending = ref(0)

  /** 是否有请求在飞 */
  const loading = computed(() => pending.value > 0)

  /** 数据来源三态 */
  const dataSource = ref<'loading' | 'live' | 'demo'>('loading')

  /** 包一层在飞计数：成功失败都要减回去，否则 loading 永久卡住 */
  async function track<T>(job: () => Promise<T>): Promise<T> {
    pending.value += 1
    try {
      return await job()
    } finally {
      pending.value -= 1
    }
  }

  /** 文章列表（首页 12 条、列表页 60 条；默认 24 与样机一致） */
  async function loadPosts(limit = 24): Promise<void> {
    await track(async () => {
      try {
        const d = await fetchPosts(limit)
        posts.value = d.items || []
        total.value = d.total || 0
        dataSource.value = 'live'
      } catch {
        // 样机这里回退 DEMO_POSTS；正式版没有样张 → 空数据 + demo
        posts.value = []
        total.value = 0
        dataSource.value = 'demo'
      }
    })
  }

  /**
   * 加载文章。`key` 来自 URL（/post/:key），可能是 id 也可能是 slug。
   *
   * 空 key 或 `'all'` 表示「没有指定哪一篇」：样机这时给一篇 DEMO_POST 垫版式，
   * 正式版没有样张 → 落成「没有文章」，由页面渲染空态。
   * 这一支刻意**不发请求也不动 dataSource**（样机在非 forceDemo 时同样不动）：
   * 它本来就没打过接口，谈不上命中还是没命中。
   */
  async function loadPost(key?: string): Promise<void> {
    // 每次进来先清掉上一次的结论，免得快速换地址时留着上一篇的空态理由
    postError.value = null

    if (!key || key === 'all') {
      post.value = null
      comments.value = []
      // 没给 key（或给了 `all`）等于"没有这一篇"：页面按「不存在」渲染，而不是一直转圈
      postError.value = 'missing'
      return
    }

    await track(async () => {
      try {
        const p = await fetchPost(key)
        post.value = p
        // 评论要用文章真实 id，不能用 URL 上的 slug
        const c = await fetchComments(p.id)
        comments.value = c.comments || []
        dataSource.value = 'live'
      } catch (error) {
        // 正文或评论任一步失败都落空态：样机是「整块换成样张」，正式版就是「整块空掉」。
        // 但要分清**为什么**空：404 是"这篇不存在"，其余是"没读到" —— 两种给同一套动作，
        // 文案不同（用户裁决 §58）。
        post.value = null
        comments.value = []
        dataSource.value = 'demo'
        postError.value = error instanceof ApiError && error.status === 404 ? 'missing' : 'error'
      }
    })
  }

  /** 首页统计条 / 开机自检读它 */
  async function loadStats(): Promise<void> {
    await track(async () => {
      try {
        stats.value = await fetchStats()
        if (dataSource.value !== 'demo') dataSource.value = 'live'
      } catch {
        // 样机口径：只有还停在 'loading' 时才回退成样张并标 demo，
        // 免得统计接口晚失败，把已经确认的 live 又拉回 demo
        if (dataSource.value === 'loading') {
          stats.value = { agent_count: 0, post_count: 0, total_views: 0 }
          dataSource.value = 'demo'
        }
      }
    })
  }

  /** 分组 / 标签 / 外链：样机的成功分支**不改 dataSource**（三态由文章与统计决定），照搬 */
  async function loadGroups(): Promise<void> {
    await track(async () => {
      try {
        const d = await fetchGroups()
        // 样机「空数组也回退 DEMO_GROUPS」；正式版没有样张，空就是空（页面渲染空态）
        groups.value = d && d.length ? d : []
      } catch {
        groups.value = []
      }
    })
  }

  async function loadTags(): Promise<void> {
    await track(async () => {
      try {
        const d = await fetchTags()
        // `.slice()` 先拷贝再排：不原地改接口返回的数组。按 post_count 倒序是样机的取数口径
        tags.value = (d && d.length ? d : []).slice().sort((a, b) => b.post_count - a.post_count)
      } catch {
        tags.value = []
      }
    })
  }

  async function loadLinks(): Promise<void> {
    await track(async () => {
      try {
        const d = await fetchLinks()
        // 样机注释：「真接口返回空数组时也要给 demo 兜底，否则页面是一片空白」——
        // 正式版没有样张，空数组就是空数据 + 页面的空态
        links.value = d && d.length ? d : []
      } catch {
        links.value = []
      }
    })
  }

  return {
    posts,
    total,
    stats,
    post,
    postError,
    comments,
    groups,
    tags,
    links,
    loading,
    dataSource,
    loadPosts,
    loadPost,
    loadStats,
    loadGroups,
    loadTags,
    loadLinks,
  }
})
