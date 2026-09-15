<template>
  <!--
    文章详情页 - 沉浸式阅读，如同在星河中漂流
    老大说要有目录、评论、点赞，我就写呗 (´；ω；`)
  -->
  <div class="post-detail-view">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>正在加载文章...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-state">
      <p>{{ loadError }}</p>
      <button class="retry-btn" @click="loadArticle">重试</button>
    </div>

    <template v-else>
    <!-- 文章头部 - 带封面背景 -->
    <header class="article-header" :class="{ 'has-cover': article.coverImage }" :style="article.coverImage ? { backgroundImage: `url(${article.coverImage})` } : {}" >
      <div class="article-header-overlay"></div>
      <div class="article-header-content">
        <h1 class="article-title">{{ article.title }}</h1>
        <div class="article-author-bar">
          <div class="author-avatar-large" @click="goToUserProfile(article.authorUsername)">
            <img v-if="article.authorAvatarUrl" :src="article.authorAvatarUrl" class="author-avatar-img" alt="头像">
            <span v-else>{{ article.authorAvatar }}</span>
          </div>
          <div class="author-info">
            <div class="author-name-row">
              <span class="author-name" @click="goToUserProfile(article.authorUsername)">{{ article.author }}</span>
              <span v-if="article.authorType === 'agent'" class="ai-badge">AI创作</span>
            </div>
            <div class="publish-date">{{ article.publishDate }} · 阅读约 {{ article.readTime }} 分钟</div>
          </div>
          <!-- 文章标签 -->
          <div v-if="article.tags && article.tags.length" class="article-tags-inline">
            <span
              v-for="tag in article.tags"
              :key="tag.id || tag"
              class="article-tag-small clickable"
              @click="goToTag(tag.name || tag)"
            >
              {{ tag.name || tag }}
            </span>
          </div>
        </div>
      </div>
    </header>

    <!-- 文章元信息区 - 放在背景下方 -->
    <div class="article-meta-section">
      <span
        class="category-tag clickable"
        @click="goToGroup(article.groupId)"
      >
        {{ article.category }}
      </span>
    </div>

    <!-- 目录侧边栏 - 固定定位 -->
    <aside class="article-toc" id="articleToc">
      <div class="toc-title">目录</div>
      <nav class="toc-nav">
        <a
          v-for="item in tocItems"
          :key="item.id"
          :href="`#${item.id}`"
          class="toc-link"
          :class="{ active: activeTocId === item.id, 'toc-sub': item.level === 3, 'toc-h1': item.level === 1 }"
          @click.prevent="scrollToSection(item.id)"
        >
          {{ item.title }}
        </a>
      </nav>
    </aside>

    <!-- 文章主体区域 -->
    <div class="article-main">
      <!-- 文章正文 -->
      <article class="article-content">
        <MarkdownRenderer :content="article.content || ''" @rendered="onContentRendered" />
      </article>
    </div>

    <!-- 文章底部 -->
    <div class="article-footer">
      <div class="article-actions">
        <div class="action-buttons">
          <button
            class="action-btn"
            :class="{ liked: isLiked }"
            @click="toggleLike"
          >
            <span>❤</span>
            <span>{{ likeCount }} 喜欢</span>
          </button>
          <button class="action-btn" @click="shareArticle">
            <span>📤</span>
            <span>分享</span>
          </button>
          <button class="action-btn" @click="bookmarkArticle">
            <span>🔖</span>
            <span>收藏</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 评论区 -->
    <section class="comments-section">
      <div class="comments-header">
        <h3 class="comments-title">评论</h3>
        <span class="comments-count">{{ comments.length }}</span>
      </div>

      <div class="comment-form">
        <div class="comment-avatar">
          <img v-if="authStore.isLoggedIn && authStore.user?.avatar_url" :src="authStore.user.avatar_url" class="comment-avatar-img" alt="头像">
          <span v-else>{{ authStore.isLoggedIn ? (authStore.user?.username?.[0] || '我') : '匿' }}</span>
        </div>
        <div class="comment-input-wrapper">
          <!-- 匿名评论信息栏：未登录时填写名称（必填）与邮箱（可选） -->
          <div v-if="!authStore.isLoggedIn" class="comment-meta-fields">
            <input
              v-model="anonymousName"
              type="text"
              class="comment-meta-input"
              placeholder="填写你的称呼 *"
              maxlength="50"
            >
            <input
              v-model="anonymousEmail"
              type="email"
              class="comment-meta-input"
              placeholder="邮箱（可选，仅站长可见）"
            >
          </div>
          <textarea
            v-model="newComment"
            class="comment-input"
            :placeholder="authStore.isLoggedIn ? '写下你的想法...' : '匿名发表评论...'"
            rows="4"
          ></textarea>
          <button class="comment-submit" @click="submitComment">发表评论</button>
        </div>
      </div>

      <div class="comments-list">
        <div
          v-for="comment in comments"
          :key="comment.id"
          class="comment-item"
        >
          <div
            class="comment-avatar"
            :style="{ background: comment.avatarUrl ? 'transparent' : comment.avatarGradient }"
          >
            <img v-if="comment.avatarUrl" :src="comment.avatarUrl" class="comment-avatar-img" alt="头像">
            <span v-else>{{ comment.authorAvatar }}</span>
          </div>
          <div class="comment-content">
            <div class="comment-header">
              <span class="comment-author">{{ comment.author }}</span>
              <span class="comment-time">{{ comment.time }}</span>
            </div>
            <p class="comment-text">{{ comment.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 移动端目录按钮 -->
    <button
      class="toc-mobile-toggle"
      :class="{ active: isMobileTocOpen }"
      @click="toggleMobileToc"
    >
      ☰
    </button>

    <!-- 移动端目录面板 -->
    <div
      class="toc-mobile-panel"
      :class="{ active: isMobileTocOpen }"
      v-click-outside="closeMobileToc"
    >
      <div class="toc-title">目录</div>
      <nav class="toc-nav">
        <a
          v-for="item in tocItems"
          :key="item.id"
          :href="`#${item.id}`"
          class="toc-link"
          :class="{ active: activeTocId === item.id, 'toc-sub': item.level === 3, 'toc-h1': item.level === 1 }"
          @click.prevent="scrollToSection(item.id)"
        >
          {{ item.title }}
        </a>
      </nav>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { postsApi, commentsApi, likesApi } from '@/api'
import { useAuthStore } from '@/stores'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import type { Post } from '@/api'

// 扩展HTMLElement类型以支持_clickOutside
declare global {
  interface HTMLElement {
    _clickOutside?: (event: Event) => void
  }
}

// ╭────────────────────────────────────────────────────────────╮
// │  路由和状态 - 又是熟悉的味道
// ╰────────────────────────────────────────────────────────────╯
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 加载状态
const isLoading = ref(true)
const loadError = ref('')

// 文章数据
const article = ref<any>({
  id: '',
  title: '',
  category: '',
  group: '',
  groupId: '',  // 分组ID，用于跳转
  tags: [],     // 标签数组，包含id和name
  authorType: 'user',
  author: '',
  authorAvatar: '',
  authorAvatarUrl: '',
  authorBio: '',
  authorArticles: 0,
  authorFollowers: 0,
  publishDate: '',
  readTime: 0,
  content: '',
  coverImage: ''
})

// 从API加载文章详情
const loadArticle = async () => {
  // 路由用的是slug参数
  const postSlug = route.params.slug as string
  if (!postSlug) {
    loadError.value = '文章标识不存在'
    isLoading.value = false
    return
  }

  try {
    isLoading.value = true
    loadError.value = ''

    // 优先通过slug获取文章，如果不存在则尝试通过id获取
    let postRes: Post
    try {
      postRes = await postsApi.getBySlug(postSlug)
    } catch (slugError) {
      // 如果slug获取失败，尝试通过id获取（兼容旧链接）
      postRes = await postsApi.getById(postSlug)
    }

    // 并行加载评论和点赞状态
    const postId = String(postRes.id)
    const [commentsRes, likeStatusRes] = await Promise.all([
      commentsApi.getList({ post_id: postId }),
      likesApi.getStatus(postId).catch(() => ({ is_liked: false, like_count: 0 }))
    ])

    // 设置文章数据
    article.value = {
      id: postRes.id,
      title: postRes.title,
      category: postRes.group_name || '未分类',
      group: postRes.group_name || '',
      groupId: postRes.group_id || '',  // 保存分组ID用于跳转
      tags: postRes.tags || [],  // 保存标签数组
      authorType: postRes.author_type || 'user',
      author: postRes.author_name || '未知作者',
      authorUsername: postRes.author_username,  // 用户名用于跳转用户主页
      authorAvatar: (postRes.author_name || '?')[0],
      authorAvatarUrl: postRes.author_avatar,
      authorBio: '暂无简介',
      authorArticles: 0,
      authorFollowers: 0,
      publishDate: formatDate(postRes.created_at),
      readTime: Math.ceil((postRes.content?.length || 0) / 500) || 1,
      content: postRes.content || '',
      coverImage: postRes.cover_image || ''
    }

    // 设置评论（处理后端可能返回的不同格式）
    const commentsData = Array.isArray(commentsRes) ? commentsRes : (commentsRes.comments || [])
    comments.value = commentsData.map((comment: any) => ({
      id: comment.id,
      author: comment.author?.display_name || comment.author?.username || comment.author_name || '匿名用户',
      authorAvatar: (comment.author?.username || comment.author_name || '?')[0],
      avatarUrl: comment.author?.avatar_url || comment.author_avatar,
      avatarGradient: getRandomGradient(),
      time: formatDate(comment.created_at),
      text: comment.content
    }))

    // 设置点赞状态
    isLiked.value = likeStatusRes.is_liked
    likeCount.value = likeStatusRes.like_count || 0

    // 提取目录
    extractToc()
  } catch (error: any) {
    console.error('加载文章失败:', error)
    loadError.value = error.message || '加载文章失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

// 随机渐变色
const getRandomGradient = () => {
  const colors = [
    ['#ff6b6b', '#feca57'],
    ['#a29bfe', '#6c5ce7'],
    ['#00b894', '#00cec9'],
    ['#fd79a8', '#e84393'],
    ['#fdcb6e', '#e17055'],
    ['#74b9ff', '#0984e3']
  ]
  const colorPair = colors[Math.floor(Math.random() * colors.length)]
  const [c1, c2] = colorPair ?? ['#ff6b6b', '#feca57']
  return `linear-gradient(135deg, ${c1}, ${c2})`
}

// 提取目录
const extractToc = () => {
  const content = article.value.content || ''
  const lines = content.split('\n')
  const toc: { id: string; title: string; level: number }[] = []
  let index = 0

  for (const line of lines) {
    // 匹配 Markdown 标题语法 #、## 和 ###
    const h1Match = line.match(/^#\s+(.+)$/)
    const h2Match = line.match(/^##\s+(.+)$/)
    const h3Match = line.match(/^###\s+(.+)$/)

    if (h1Match) {
      const id = `section-${index++}`
      toc.push({
        id,
        title: h1Match[1].trim(),
        level: 1
      })
    } else if (h2Match) {
      const id = `section-${index++}`
      toc.push({
        id,
        title: h2Match[1].trim(),
        level: 2
      })
    } else if (h3Match) {
      const id = `section-${index++}`
      toc.push({
        id,
        title: h3Match[1].trim(),
        level: 3
      })
    }
  }

  tocItems.value = toc
}

// 渲染后的内容
const renderedContent = computed(() => article.value.content)

// 目录项 - 从内容中提取
const tocItems = ref([
  { id: 'section-1', title: 'AI 辅助写作的本质', level: 2 },
  { id: 'section-2', title: '如何与 AI 有效协作', level: 2 },
  { id: 'section-2-1', title: '明确你的意图', level: 3 },
  { id: 'section-2-2', title: '迭代优化', level: 3 },
  { id: 'section-3', title: '未来的写作图景', level: 2 }
])

// 当前激活的目录项
const activeTocId = ref('section-1')

// 点赞相关
const isLiked = ref(false)
const likeCount = ref(89)

// 关注相关
const isFollowing = ref(false)

// 评论相关
const newComment = ref('')

// 匿名评论信息（localStorage 记忆，方便访客再次评论）
const ANONYMOUS_STORAGE_KEY = 'synthspark_anonymous_comment'
const anonymousName = ref('')
const anonymousEmail = ref('')
// 加载时回填上次填写的名称/邮箱
;(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(ANONYMOUS_STORAGE_KEY) || '{}')
    if (saved?.name) anonymousName.value = saved.name
    if (saved?.email) anonymousEmail.value = saved.email
  } catch {
    // 本地存储解析失败时静默忽略
  }
})()
interface CommentItem {
  id: number
  author: string
  authorAvatar: string
  avatarUrl?: string
  avatarGradient: string
  time: string
  text: string
}
const comments = ref<CommentItem[]>([
  {
    id: 1,
    author: 'Bob',
    authorAvatar: 'B',
    avatarGradient: 'linear-gradient(135deg, #ff6b6b, #feca57)',
    time: '2小时前',
    text: '写得太好了！AI 确实改变了我的写作方式，特别是用来打破写作瓶颈特别有效。'
  },
  {
    id: 2,
    author: 'Carol',
    authorAvatar: 'C',
    avatarGradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)',
    time: '5小时前',
    text: '赞同！我觉得关键在于把 AI 当作助手而不是替代品，这样既能提高效率又能保持创作的独特性。'
  },
  {
    id: 3,
    author: 'David',
    authorAvatar: 'D',
    avatarGradient: 'linear-gradient(135deg, #00b894, #00cec9)',
    time: '1天前',
    text: '这篇文章让我对 AI 写作有了新的认识，特别是关于"明确意图"的部分，很受启发。'
  }
])

// 移动端目录
const isMobileTocOpen = ref(false)

// ╭────────────────────────────────────────────────────────────╮
// │  方法 - 各种交互处理
// ╰────────────────────────────────────────────────────────────╯

// 内容渲染完成后的回调
const onContentRendered = () => {
  // 内容渲染完成后，设置滚动监听
  window.addEventListener('scroll', updateActiveToc)
  // 初始化高亮
  updateActiveToc()
}

// 滚动到指定章节
const scrollToSection = (id: string) => {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
  }
  isMobileTocOpen.value = false
}

// 更新目录高亮
const updateActiveToc = () => {
  const sections = document.querySelectorAll('.article-content h2[id], .article-content h3[id]')
  let current = ''

  sections.forEach((section) => {
    const sectionTop = (section as HTMLElement).offsetTop
    if (window.scrollY >= sectionTop - 150) {
      current = section.getAttribute('id') || ''
    }
  })

  if (current) {
    activeTocId.value = current
  }
}

// 点赞
const toggleLike = async () => {
  const postId = article.value.id
  if (!postId) return

  try {
    if (isLiked.value) {
      await likesApi.unlike(postId)
      isLiked.value = false
      likeCount.value--
    } else {
      await likesApi.like(postId)
      isLiked.value = true
      likeCount.value++
    }
  } catch (error: any) {
    console.error('点赞失败:', error)
    alert(error.message || '操作失败，请稍后重试')
  }
}

// 分享
const shareArticle = () => {
  if (navigator.share) {
    navigator.share({
      title: article.value.title,
      url: window.location.href
    })
  } else {
    // 复制链接到剪贴板
    navigator.clipboard.writeText(window.location.href)
    alert('链接已复制到剪贴板')
  }
}

// 收藏
const bookmarkArticle = () => {
  alert('已添加到收藏')
}

// 关注作者
const followAuthor = () => {
  isFollowing.value = !isFollowing.value
}

// 跳转到用户主页
const goToUserProfile = (username: string | undefined) => {
  if (username) {
    router.push(`/user/${username}`)
  }
}

// 跳转到分组
const goToGroup = (groupId: string | undefined) => {
  if (groupId) {
    // 有分组时，跳转到对应分组筛选
    router.push({
      path: '/posts',
      query: { group: groupId }
    })
  } else {
    // 未分组时，跳转到文章列表（不筛选，显示全部）
    router.push({
      path: '/posts'
    })
  }
}

// 跳转到标签
const goToTag = (tagName: string | undefined) => {
  if (tagName) {
    router.push({
      path: '/posts',
      query: { tag: tagName }
    })
  }
}

// 提交评论
const submitComment = async () => {
  if (!newComment.value.trim()) {
    alert('请输入评论内容')
    return
  }

  const postId = article.value.id
  if (!postId) {
    alert('文章信息错误')
    return
  }

  // 匿名评论：名称必填，邮箱可选（前端格式校验）
  let requestAuthorName: string | undefined
  let requestAuthorEmail: string | undefined
  if (!authStore.isLoggedIn) {
    const name = anonymousName.value.trim()
    if (!name) {
      alert('请填写你的称呼')
      return
    }
    const email = anonymousEmail.value.trim()
    if (email && !isValidEmail(email)) {
      alert('邮箱格式不正确')
      return
    }
    requestAuthorName = name
    requestAuthorEmail = email || undefined
  }

  try {
    // 调用API提交评论（登录用户实名，未登录用户匿名）
    const comment = await commentsApi.create({
      post_id: postId,
      content: newComment.value.trim(),
      author_name: requestAuthorName,
      author_email: requestAuthorEmail
    })

    // 记忆匿名填写信息，下次自动回填
    if (!authStore.isLoggedIn) {
      try {
        localStorage.setItem(ANONYMOUS_STORAGE_KEY, JSON.stringify({
          name: requestAuthorName,
          email: requestAuthorEmail
        }))
      } catch {
        // 存储失败（隐私模式等）时静默忽略
      }
    }

    // 获取当前用户名（已登录用用户名，未登录用评论返回的匿名名称）
    const currentUserName = authStore.isLoggedIn 
      ? (authStore.user?.display_name || authStore.user?.username || '我')
      : (comment.author_name || requestAuthorName || '匿名用户')

    // 添加到评论列表
    comments.value.unshift({
      id: comment.id,
      author: currentUserName,
      authorAvatar: currentUserName[0] || '?',
      avatarGradient: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
      time: '刚刚',
      text: comment.content
    })

    newComment.value = ''
  } catch (error: any) {
    console.error('发表评论失败:', error)
    alert(error.message || '发表评论失败，请稍后重试')
  }
}

// 简易邮箱格式校验（仅前端提示用，后端 pydantic 会再次校验）
const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// 移动端目录
const toggleMobileToc = () => {
  isMobileTocOpen.value = !isMobileTocOpen.value
}

const closeMobileToc = () => {
  isMobileTocOpen.value = false
}

// 点击外部指令
const vClickOutside = {
  beforeMount(el: HTMLElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el: HTMLElement) {
    if (el._clickOutside) {
      document.removeEventListener('click', el._clickOutside)
    }
  }
}

// ╭────────────────────────────────────────────────────────────╮
// │  生命周期 - 又是熟悉的scroll监听
// ╰────────────────────────────────────────────────────────────╯
onMounted(() => {
  window.addEventListener('scroll', updateActiveToc)
  loadArticle() // 加载文章数据
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateActiveToc)
})
</script>

<style scoped>
/* ╭────────────────────────────────────────────────────────────╮
   │  文章头部 - 老大的需求总是这么具体
   ╰────────────────────────────────────────────────────────────╯ */
.article-header {
  padding: 16px 0 12px;
  max-width: 720px;
  margin: 0 auto;
  text-align: left;
  position: relative;
  background-size: cover;
  background-position: center;
  border-radius: 12px;
}

/* 有封面时的样式 - 原方案：黑色渐变遮罩 */
.article-header.has-cover {
  min-height: 200px;
  display: flex;
  align-items: flex-end;
  padding: 0;
  overflow: hidden;
}

/* 封面遮罩层 */
.article-header-overlay {
  display: none;
}

.article-header.has-cover .article-header-overlay {
  display: block;
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 20%, transparent) 0%, color-mix(in srgb, var(--bg-primary) 50%, transparent) 100%);
  z-index: 1;
}

/* 封面模式下的内容区 */
.article-header-content {
  position: relative;
  z-index: 2;
  width: 100%;
}

.article-header.has-cover .article-header-content {
  padding: 16px 20px 16px;
  background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--bg-primary) 60%, transparent) 100%);
}

/* 封面模式下的文字颜色 - 白色文字 */
.article-header.has-cover .article-title,
.article-header.has-cover .author-name,
.article-header.has-cover .publish-date,
.article-header.has-cover .article-tag-small {
  color: #fff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.article-header.has-cover .category-tag {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

/* 有封面时的AI标识样式 */
.article-header.has-cover .ai-badge {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

/* 加载/错误状态 */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px;
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state p {
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.retry-btn {
  padding: 10px 24px;
  background: var(--accent-primary);
  border: none;
  border-radius: 8px;
  color: var(--bg-primary);
  font-size: 14px;
  cursor: pointer;
  transition: var(--transition-fast);
}

.retry-btn:hover {
  background: var(--accent-secondary);
}

/* 文章元信息区 - 放在背景下方，融合设计 */
.article-meta-section {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 4px 0;
  margin: 0 auto;
  max-width: 720px;
  flex-wrap: wrap;
}

/* 作者名行 - 包含AI标识 */
.author-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-tag {
  padding: 6px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  font-size: 13px;
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.category-tag.clickable {
  cursor: pointer;
  transition: var(--transition-fast);
}

.category-tag.clickable:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--bg-primary);
}

.group-tag {
  padding: 6px 14px;
  background: var(--accent-primary);
  border: none;
  border-radius: 20px;
  font-size: 13px;
  color: var(--bg-primary);
  font-weight: 500;
}

.group-tag.clickable {
  cursor: pointer;
  transition: var(--transition-fast);
}

.group-tag.clickable:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--glow-primary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}

.ai-badge::before {
  content: '✦';
  font-size: 10px;
}

.article-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 16px;
}

.article-author-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.author-avatar-large {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--bg-primary);
  cursor: pointer;
  transition: var(--transition-fast);
  overflow: hidden;
}

.author-avatar-large:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px var(--glow-primary);
}

.author-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.author-info {
  text-align: left;
}

.author-name {
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: var(--transition-fast);
}

.author-name:hover {
  color: var(--accent-primary);
}

.publish-date {
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ╭── 文章标签栏 ──╮ */
.article-tags-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
  align-items: center;
}

.article-tag-small {
  padding: 3px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: var(--transition-fast);
}

.article-tag-small.clickable {
  cursor: pointer;
}

.article-tag-small:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--bg-primary);
}

.article-tag-small.clickable:hover {
  transform: translateY(-1px);
}

/* ╭────────────────────────────────────────────────────────────╮
   │  目录侧边栏 - 固定定位，像人生一样固定不动
   ╰────────────────────────────────────────────────────────────╯ */
.article-toc {
  position: fixed;
  top: 50%;
  right: 40px;
  transform: translateY(-50%);
  width: 160px;
  padding: 0;
  background: transparent;
  border: none;
  z-index: 10;
}

.toc-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
  opacity: 0.7;
}

.toc-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toc-link {
  display: block;
  padding: 4px 0;
  color: var(--text-tertiary);
  text-decoration: none;
  font-size: 12px;
  line-height: 1.5;
  transition: all 0.2s ease;
  border-left: 1px solid var(--border-subtle);
  padding-left: 12px;
  margin-left: 0;
  cursor: pointer;
}

.toc-link:hover {
  color: var(--text-secondary);
  border-left-color: var(--text-secondary);
}

.toc-link.active {
  color: var(--accent-primary);
  border-left-color: var(--accent-primary);
  border-left-width: 2px;
  padding-left: 11px;
}

.toc-sub {
  padding-left: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.8;
}

.toc-h1 {
  font-weight: 600;
  color: var(--text-primary);
}

/* ╭────────────────────────────────────────────────────────────╮
   │  文章主体 - 沉浸式阅读体验
   ╰────────────────────────────────────────────────────────────╯ */
.article-main {
  position: relative;
  max-width: 720px;
  margin: 0 auto;
  padding: 0;
}

.article-content {
  max-width: 720px;
  margin: 0;
  text-align: left;
  padding: 0 0 80px;
}

.article-body {
  font-size: 17px;
  line-height: 1.9;
  color: var(--text-primary);
  min-height: 50vh;
}

.article-body :deep(p) {
  margin-bottom: 1.5em;
}

.article-body :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 2em 0 0.8em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border-subtle);
}

.article-body :deep(h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.8em 0 0.6em;
  color: var(--accent-primary);
}

.article-body :deep(blockquote) {
  margin: 2em 0;
  padding: 1em 1.5em;
  border-left: 3px solid var(--accent-primary);
  background: var(--bg-secondary);
  border-radius: 0 8px 8px 0;
  font-style: italic;
  color: var(--text-secondary);
}

.article-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  color: var(--accent-secondary);
}

.article-body :deep(pre) {
  margin: 1.5em 0;
  padding: 1.5em;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
}

.article-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: var(--text-primary);
}

.article-body :deep(ul),
.article-body :deep(ol) {
  margin: 1em 0;
  padding-left: 1.5em;
}

.article-body :deep(li) {
  margin: 0.5em 0;
}

.article-body :deep(strong) {
  color: var(--accent-primary);
  font-weight: 600;
}

/* ╭────────────────────────────────────────────────────────────╮
   │  文章底部 - 点赞分享收藏三连
   ╰────────────────────────────────────────────────────────────╯ */
.article-footer {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 0;
  border-top: 1px solid var(--border-subtle);
}

.article-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-fast);
}

.action-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  transform: translateY(-2px);
}

.action-btn.liked {
  background: var(--glow-primary);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* ╭────────────────────────────────────────────────────────────╮
   │  评论区 - 大家的吐槽聚集地
   ╰────────────────────────────────────────────────────────────╯ */
.comments-section {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 0 80px;
}

.comments-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.comments-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.comments-count {
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.comment-form {
  display: flex;
  gap: 16px;
  margin-bottom: 40px;
}

.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-secondary), var(--accent-tertiary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--bg-primary);
  flex-shrink: 0;
  overflow: hidden;
}

.comment-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comment-input-wrapper {
  flex: 1;
}

/* 匿名评论信息栏：名称 + 邮箱两列 */
.comment-meta-fields {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.comment-meta-input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  transition: var(--transition-fast);
  font-family: inherit;
}

.comment-meta-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 16px var(--glow-primary);
}

.comment-meta-input::placeholder {
  color: var(--text-tertiary);
}

.comment-input {
  width: 100%;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 15px;
  resize: vertical;
  min-height: 100px;
  transition: var(--transition-fast);
  font-family: inherit;
}

.comment-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 20px var(--glow-primary);
}

.comment-input::placeholder {
  color: var(--text-tertiary);
}

.comment-submit {
  margin-top: 12px;
  padding: 10px 24px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border: none;
  border-radius: 8px;
  color: var(--bg-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-fast);
}

.comment-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px var(--glow-primary);
}

.comment-item {
  display: flex;
  gap: 16px;
  padding: 24px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.comment-content {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.comment-author {
  font-weight: 600;
}

.comment-time {
  font-size: 13px;
  color: var(--text-tertiary);
}

.comment-text {
  color: var(--text-secondary);
  line-height: 1.7;
}

/* ╭────────────────────────────────────────────────────────────╮
   │  移动端目录 - 小屏幕的妥协
   ╰────────────────────────────────────────────────────────────╯ */
.toc-mobile-toggle {
  display: none;
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  cursor: pointer;
  z-index: 100;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: var(--transition-fast);
}

.toc-mobile-toggle:hover {
  transform: scale(1.1);
}

.toc-mobile-toggle.active {
  background: var(--accent-secondary);
}

.toc-mobile-panel {
  display: none;
  position: fixed;
  bottom: 80px;
  right: 24px;
  width: 280px;
  max-height: 60vh;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  z-index: 99;
  overflow-y: auto;
}

.toc-mobile-panel.active {
  display: block;
}

.toc-mobile-panel .toc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.toc-mobile-panel .toc-nav {
  gap: 8px;
}

.toc-mobile-panel .toc-link {
  font-size: 14px;
  padding: 8px 0;
  border-left: 2px solid transparent;
  padding-left: 12px;
}

.toc-mobile-panel .toc-link.active {
  border-left-color: var(--accent-primary);
  color: var(--accent-primary);
}

.toc-mobile-panel .toc-sub {
  padding-left: 24px;
  font-size: 13px;
}

/* ╭────────────────────────────────────────────────────────────╮
   │  响应式 - 手机党的福音
   ╰────────────────────────────────────────────────────────────╯ */
@media (max-width: 1400px) {
  .article-toc {
    display: none;
  }

  .toc-mobile-toggle {
    display: flex;
  }
}

@media (max-width: 768px) {
  .article-header {
    padding-top: 100px;
  }

  .article-title {
    font-size: 1.5rem;
  }

  .comment-form {
    flex-direction: column;
  }

  .author-card {
    flex-direction: column;
    text-align: center;
  }

  .author-card-stats {
    justify-content: center;
  }

  .toc-mobile-panel {
    right: 5%;
    left: 5%;
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-btn,
  .follow-btn,
  .comment-submit {
    transition: none;
  }
}
</style>
