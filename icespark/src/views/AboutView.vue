<script setup lang="ts">
/**
 * ABOUT 场景：关于
 *
 * 内容本身也用 markdown 渲染 —— 关于页是最好的渲染器验收样本
 * （标题 / 列表 / 引用 / 表格 / 代码块五种结构一次性看全）。
 *
 * 键盘：↑↓ 逐行滚动，PgUp / PgDn 整屏滚动，U 回顶部，ESC 打开菜单。
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
 */
import { onMounted, onUnmounted } from 'vue'

import { onPad } from '@/input/pad'
import { useSiteStore } from '@/stores/site'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { scrollScreenBy, scrollScreenTop } from '@/scene/screen'
import MarkdownBody from '@/signal/MarkdownBody.vue'

const { clock, stop } = useStatusBar()
const site = useSiteStore()

const SCROLL_STEP = 64
const PAGE_STEP = 360

onMounted(() => {
  scrollScreenTop()
})
onUnmounted(stop)

const off = onPad((a) => {
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
      <span class="hint">↑↓ 滚动 · PgUp/PgDn 整屏 · U 回顶部 · ESC 菜单</span>
    </SceneHead>

    <div class="about-wrap">
      <div class="facts px" data-testid="about-facts">
        <div v-for="f in site.config.about.facts" :key="f.key" class="fact">
          <span class="fact-k">{{ f.key }}</span>
          <span class="fact-v">{{ f.value }}</span>
        </div>
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
