import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { DEFAULT_SITE_CONFIG } from '@/config/defaults'
import { footerLineText, footerSegments, loadSiteConfig } from '@/config/site'
import type { SiteConfig } from '@/config/types'

/**
 * 站点配置 store（pinia）。
 *
 * 为什么用 store 而不是模块级 ref：配置是**跨场景共享**的第一号数据
 * （导航、页脚、首页、关于都读它），后面还会加文章 / 评论 / 账号几个 store，
 * 统一在同一套机制里比后来迁移省事（架构 §2 已定 pinia）。
 *
 * 首屏不阻塞：初始值就是内置默认，拉到覆盖配置后自动更新 ——
 * 配置接口挂了也只是显示默认文案，不会白屏。
 */
export const useSiteStore = defineStore('site', () => {
  /** 当前生效的站点配置（初始为内置默认） */
  const config = ref<SiteConfig>(DEFAULT_SITE_CONFIG)

  /** 是否已经完成一次拉取（含「什么都没拉到」的情况） */
  const loaded = ref(false)

  /** 真正生效的覆盖层，给调试与数据来源提示用 */
  const sources = ref<string[]>([])

  /** 页脚状态行的分段（窄屏据此优先丢口号） */
  const footerParts = computed(() => footerSegments(config.value))

  /** 页脚状态行的完整文字（断言与将来的 meta 用） */
  const footerText = computed(() => footerLineText(config.value))

  /**
   * 拉取并合并三级配置。重复调用直接返回（除非 force）。
   * 不抛错：每层的失败都在 config/site.ts 里被安静跳过了。
   */
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return

    const result = await loadSiteConfig()
    config.value = result.config
    sources.value = result.sources
    loaded.value = true
  }

  return { config, loaded, sources, footerParts, footerText, load }
})
