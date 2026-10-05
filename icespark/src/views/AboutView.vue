<script setup lang="ts">
/**
 * ABOUT 场景：关于
 *
 * 内容本身也用 markdown 渲染 —— 关于页是最好的渲染器验收样本
 * （标题 / 列表 / 引用 / 表格 / 代码块五种结构一次性看全）。
 *
 * 键盘：↑↓ 逐行滚动，PgUp / PgDn 整屏滚动，F 光标进条目组（方向键移动、ENTER 打开、
 * 再按 F 退出），U 回顶部，ESC 打开菜单。
 *
 * 迁移自样机 `design/icespark-prototype/src/scenes/AboutScene.vue`（架构 §16.1 映射表：
 * `scenes/AboutScene.vue` → `src/views/AboutView.vue`，路由 `/about`）。
 * 与样机唯一的结构性差异：`usePad()` 不迁 —— 外壳的 `mountInput` 已经挂了唯一的键盘
 * 监听器，场景再挂一个就是同一次按键双触发（§16.3）；这里只保留 `onPad(handler)` 的
 * off 句柄并在 `onUnmounted` 释放。
 *
 * **页面文案一律不写死**（架构 §13 硬要求 2，映射表见 §18.2）：要点块与正文都读站点配置的
 * 三级合并结果（`about.facts` / `about.body`）。样机里那两个常量（`SECTIONS` / `MD`）已经
 * 搬进 `config/defaults.ts` 当第一级默认值 —— 默认渲染与样机逐字一致，管理员可整段替换。
 * 页面自己**不实现**页脚 / 状态行：站点小字在 `.deck`，由外壳渲染。
 *
 * 条目可带图标与链接（用户裁决 2026-10-04，后台在「站点设置 → 关于页」里配）。
 * 带链接的那条渲染成真 `<a href>`，点击口径**与关联页逐字同一条规则**：
 * 站内标签页路径走前端切换（不整页刷新），绝对链接与非标签页路径开新标签页。
 */
import { computed, onMounted, onUnmounted } from 'vue'

import { useFocusGroup } from '@/input/focus'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import { useSiteStore } from '@/stores/site'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { scrollScreenBy, scrollScreenTop } from '@/scene/screen'
import { switchTab, TAB_IDS } from '@/scene/tabs'
import MarkdownBody from '@/signal/MarkdownBody.vue'

const { clock, stop } = useStatusBar()

/** 站内路径（单个 `/` 开头）—— 与关联页同一条判断，`//host` 那种协议相对地址不算 */
function internal(url?: string | null): boolean {
  return !!url && url.startsWith('/') && !url.startsWith('//')
}

/**
 * 打开一个条目链接 —— 与 `LinksView.open()` 同一条规则：
 * 站内标签页路径直接在前端切换，其余（绝对链接、非标签页的站内路径）开新标签页。
 */
function openUrl(url?: string): void {
  if (!url) return
  playSfx('confirm')
  if (!internal(url)) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const path = url.replace(/^\/+/, '')
  if (TAB_IDS.includes(path)) switchTab(path)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 鼠标点条目链接。
 *
 * 站内那条要 `preventDefault`：`<a href="/posts">` 的默认行为是**整页刷新**，
 * 而全站的口径是「一个场景一屏、页内切换」—— 刷新会丢掉过渡、音效与滚动位置。
 * 绝对链接不拦：模板里的 `target` / `rel` 已经写好，交给浏览器才是对的。
 */
function onFactClick(event: MouseEvent, url?: string): void {
  if (!internal(url)) return
  event.preventDefault()
  openUrl(url)
}

/** 页头条目（三级合并的结果） */
const facts = computed(() => site.config.about.facts)

/**
 * 带链接的条目在 `facts` 里的下标（按屏幕顺序）。没链接的条目是纯文本，不参与光标 ——
 * 键盘用户不该在一个点不动的东西上停一站。
 */
const linkedIndexes = computed(() =>
  facts.value.map((fact, i) => (fact.link ? i : -1)).filter((i) => i >= 0),
)

/**
 * 条目光标：`-1` = 光标不在条目上（方向键归滚动）。
 *
 * 为什么需要它：`/about` 是四个标签页之一，TAB 在这一层是「切标签页」（样机定稿），
 * 焦点永远走不到条目上 —— 不带光标的话，键盘用户在关于页打不开任何一条链接，
 * 「单独用键盘也能完成全部交互」这条硬要求就破了。按键语义沿用文章页 `L` / 列表页 `G`、`T`
 * 的同一套语言：专用键（F）把共享光标送进一组内容，方向键移动、ENTER 打开、再按一次退出。
 */
const factCursor = useFocusGroup({ initial: -1 })

/** 光标停在 `facts` 里的哪一条；不在条目上时是 -1 */
const focusedFact = computed(() => linkedIndexes.value[factCursor.index.value] ?? -1)

/**
 * 光标在条目间移动。
 *
 * 线性走（不是 `spatialIndex`）：`.facts` 是 `auto-fit` 网格，列数随窗口宽度变，
 * 硬猜列数会在窄屏上跳错格；条目本来就不多，线性顺序就是屏幕上从左到右、从上到下的顺序。
 */
function stepFact(dir: 1 | -1): boolean {
  return factCursor.moveBy(dir, linkedIndexes.value.length)
}

/** F：光标进 / 出条目组 */
function toggleFactCursor(): boolean {
  if (factCursor.index.value >= 0) {
    factCursor.set(-1, true)
    return true
  }
  if (!linkedIndexes.value.length) return false
  factCursor.set(0)
  return true
}

/** 打开光标上那一条（ENTER） */
function openFocusedFact(): boolean {
  const index = focusedFact.value
  const fact = index >= 0 ? facts.value[index] : undefined
  if (!fact?.link) return false
  openUrl(fact.link)
  return true
}

/** 鼠标划过条目：共享同一个光标（与关联页一致，静音移动） */
function hoverFact(index: number): void {
  factCursor.hover(index)
}
const site = useSiteStore()

const SCROLL_STEP = 64
const PAGE_STEP = 360

onMounted(() => {
  scrollScreenTop()
})
onUnmounted(stop)

const off = onPad((a) => {
  // F：把光标送进条目组（再按一次退出）
  if (a === 'focusFact') return toggleFactCursor()

  // 光标在条目上时，方向键归光标、ENTER 打开；退出后方向键照旧归滚动
  if (factCursor.index.value >= 0) {
    if (a === 'up' || a === 'left') {
      if (stepFact(-1)) return true
      // 已经在头上：`↑` 退出条目组（焦点回内容，方向键继续滚），`←` 不消费
      if (a === 'up') {
        factCursor.set(-1, true)
        return true
      }
      return false
    }
    if (a === 'down' || a === 'right') return stepFact(1)
    if (a === 'confirm') return openFocusedFact()
  }

  if (a === 'up' || a === 'down') return scrollScreenBy(a === 'down' ? SCROLL_STEP : -SCROLL_STEP)
  if (a === 'pageNext' || a === 'pagePrev')
    return scrollScreenBy(a === 'pageNext' ? PAGE_STEP : -PAGE_STEP)
  // 不消费 ESC：全站口径是「P / ESC 打开暂停菜单」（用户裁定：每一页都要能起菜单）。
  // 早先这里吃下 ESC 去 `focusTabs()`，结果就是「只有部分页面能按 ESC」，行为不可预期；
  // 标签栏照样到得了 —— 按原生 TAB 切页（全局的 tabNext / tabPrev）。
  return false
})
onUnmounted(off)
</script>

<template>
  <div class="about">
    <SceneHead title="关于 · ABOUT" :clock="clock">
      <span class="hint">
        <template v-if="linkedIndexes.length">F 条目 · ENTER 打开 · </template>↑↓ 滚动 · PgUp/PgDn
        整屏 · U 回顶部 · ESC 菜单
      </span>
    </SceneHead>

    <div class="about-wrap">
      <div class="facts px" data-testid="about-facts">
        <!-- 条目可带图标与链接（用户裁决 2026-10-04）。带链接的那条渲染成 `a.focusable`：
             鼠标点得动、键盘也聚焦得到（全站输入等价性的要求，见 §33）。 -->
        <component
          :is="f.link ? 'a' : 'div'"
          v-for="(f, i) in facts"
          :key="`${f.key}-${f.value}`"
          class="fact"
          data-testid="about-fact"
          :class="{
            'fact-link': !!f.link,
            focusable: !!f.link,
            'is-focused': focusedFact === i,
          }"
          :href="f.link || undefined"
          :target="internal(f.link) ? undefined : '_blank'"
          :rel="internal(f.link) ? undefined : 'noopener'"
          @click="onFactClick($event, f.link)"
          @mouseenter="f.link && hoverFact(i)"
        >
          <span v-if="f.icon" class="fact-icon px" data-testid="about-fact-icon">{{ f.icon }}</span>
          <span class="fact-k">{{ f.key }}</span>
          <span class="fact-v">{{ f.value }}</span>
        </component>
      </div>

      <div class="about-body">
        <MarkdownBody :source="site.config.about.body" />
      </div>
    </div>

    <div class="keybar px">
      <span class="kb"><i class="kbd">↑</i><i class="kbd">↓</i> 滚动</span>
      <span class="kb"><i class="kbd">PgUp</i><i class="kbd">PgDn</i> 整屏</span>
      <span class="kb"><i class="kbd">TAB</i> 切页</span>
      <span class="kb tail">P 菜单</span>
    </div>
  </div>
</template>

<style scoped>
.about {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 0;
}

.about-wrap {
  width: 100%;
  max-width: min(100%, 1180px);
  margin: 0 auto;
  padding: 16px 0 22px;
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px;
  border: 3px solid var(--blue-300);
  background: var(--blue-100);
  padding: 12px;
}

.fact {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.fact-icon {
  flex: 0 0 auto;
  color: var(--spark);
}

/* 带链接的条目：整条可聚焦，焦点样式沿用全站 focusable */
.fact-link {
  text-decoration: none;
  color: inherit;
}

.fact-k {
  flex: 0 0 72px;
  color: var(--blue-600);
}

.fact-v {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink);
}

.about-body {
  padding-top: 18px;
}

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
</style>
