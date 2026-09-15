/**
 * 主题状态管理
 * 主题元数据由 src/themes/index.ts 自动发现（系统主题 + 自定义主题）
 * - currentTheme 为动态 string（自定义主题无法静态枚举）
 * - 主题切换时调用对应主题脚本的 activate/deactivate 生命周期钩子
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  THEMES,
  themeCategories,
  getThemeMeta,
  getCategoryLabel,
  activateThemeScript,
  deactivateThemeScript,
  type Theme,
} from '@/themes'
import { getSiteConfig } from '@/config/siteConfig'

// 向后兼容导出（旧代码路径：@/stores/theme）
export type { Theme } from '@/themes'
export { themeCategories } from '@/themes'

// 本地存储键名
const THEME_STORAGE_KEY = 'synthspark-theme'

// 旧主题映射（用于迁移）
const legacyThemeMap: Record<string, Theme> = {
  'dark': 'deep-space',
  'light': 'deep-space',
  'spark-lab': 'deep-space',
  'ocean': 'deep-space',
  'midnight': 'deep-space',
  'forest': 'bamboo',
  'veda': 'cyberpunk',
  'bangdream-dark': 'twins'
}

export const useThemeStore = defineStore('theme', () => {
  // 当前主题
  const currentTheme = ref<Theme>('exia')

  // 是否已初始化
  const isInitialized = ref(false)

  // 当前主题脚本的 cleanup（activate 返回的清理函数，离开主题时调用）
  let scriptCleanup: (() => void) | undefined

  // 获取存储的主题（兼容旧主题；无存储时用站点配置的默认主题）
  const getStoredTheme = (): Theme => {
    if (typeof window === 'undefined') return 'exia'
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    // 兼容旧主题映射
    if (stored && legacyThemeMap[stored]) {
      return legacyThemeMap[stored]
    }
    // 检查是否是已发现的有效主题
    if (stored && THEMES.some(t => t.id === stored)) {
      return stored
    }
    // 首次访问（无本地存储）时，使用站点配置的默认主题（无效值回退 exia）
    const configured = getSiteConfig().site.defaultTheme
    return THEMES.some(t => t.id === configured) ? configured : 'exia'
  }

  // 设置主题
  const setTheme = (theme: Theme) => {
    // 无效主题（未被发现）时忽略
    if (!THEMES.some(t => t.id === theme)) return

    // 停用旧主题脚本（cleanup 优先，其次 deactivate 钩子）
    const oldMeta = getThemeMeta(currentTheme.value)
    scriptCleanup?.()
    scriptCleanup = undefined
    deactivateThemeScript(oldMeta, currentTheme.value)

    currentTheme.value = theme

    // 应用到DOM
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
    }

    // 持久化存储
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }

    // 激活新主题脚本（脚本可返回 cleanup，离开时自动执行）
    scriptCleanup = activateThemeScript(getThemeMeta(theme), theme)
  }

  // 初始化主题
  const initTheme = () => {
    if (isInitialized.value) return

    const theme = getStoredTheme()
    setTheme(theme)
    isInitialized.value = true
  }

  // 切换主题（在深空/赛博朋克/樱花/星歌四个核心主题间循环）
  const toggleTheme = () => {
    const themes: Theme[] = ['deep-space', 'cyberpunk', 'sakura', 'mygo-light']
    const currentIndex = themes.indexOf(currentTheme.value)
    const nextIndex = (currentIndex + 1) % themes.length
    const nextTheme = themes[nextIndex]
    if (nextTheme) {
      setTheme(nextTheme)
    }
  }

  // 获取主题名称（由动态 THEMES 查找）
  const themeName = computed(() => {
    return getThemeMeta(currentTheme.value)?.name || '深空'
  })

  // 获取主题分类（由动态 THEMES 分类判断，未知分类回退科幻标签）
  const themeCategory = computed(() => {
    const meta = getThemeMeta(currentTheme.value)
    if (meta) {
      return getCategoryLabel(meta.category)
    }
    return getCategoryLabel('scifi')
  })

  return {
    currentTheme,
    isInitialized,
    themeName,
    themeCategory,
    setTheme,
    initTheme,
    toggleTheme
  }
})
