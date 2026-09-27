<script setup lang="ts">
/**
 * 8bit 标签栏
 *
 * 浏览类页面（主页 / 文章 / 关联 / 关于）并列在这个条上，取代「层层深入的页面 + 面包屑」。
 *
 * 输入等价性（用户硬要求：单独鼠标、单独键盘都能完成全部操作）：
 * - 键盘：内容区按 ↑ 顶到首行之上 → 焦点进入标签栏；←→ 选页；A/Enter 进入；↓ 或 B/ESC 退回内容区
 * - 键盘快捷：Q / E 在任何场景下直接前后切页（见 App.vue 的全局键）
 * - 鼠标：划过即共享焦点（静音），点击直接切页；指针移出标签栏时焦点交还内容区
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { onPad } from './pad'
import { playSfx } from './sfx'
import { TABS, activeTab, tabIndex, focusZone, switchTab, focusTabs, blurTabs } from './tabs'

const navEl = ref<HTMLElement | null>(null)

function hoverTab(i: number) {
  // 鼠标路径：静音移动焦点（共享焦点模型，不给鼠标单独一套 hover 态）
  if (tabIndex.value !== i) tabIndex.value = i
  focusTabs(i)
}

function clickTab(i: number) {
  const id = TABS[i].id
  if (id === activeTab.value) {
    blurTabs()
    return
  }
  switchTab(id)
}

/**
 * 指针只要离开标签栏就把焦点交还内容区。
 * 没有这一条会出现很烦人的状态：鼠标在标签栏上划了一下，之后按方向键却一直在切标签页，
 * 因为「焦点在标签栏」这个状态没人负责撤销。
 */
function onPointerMove(e: PointerEvent) {
  if (focusZone.value !== 'tabs') return
  const t = e.target as Node | null
  if (navEl.value && t && navEl.value.contains(t)) return
  blurTabs()
}

const off = onPad((a) => {
  if (focusZone.value !== 'tabs') return false
  if (a === 'left' || a === 'right') {
    const n = TABS.length
    const next = (tabIndex.value + (a === 'left' ? -1 : 1) + n) % n
    tabIndex.value = next
    playSfx('move')
    return true
  }
  if (a === 'down' || a === 'confirm') {
    // 进入当前标签页，焦点交还内容区
    switchTab(TABS[tabIndex.value].id)
    playSfx('confirm')
    return true
  }
  if (a === 'cancel') {
    blurTabs()
    return true
  }
  // 上下键在标签栏里不做事，但必须消费掉，否则背后的场景会跟着动
  if (a === 'up') return true
  return false
}, 'any')

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  off()
})
</script>

<template>
  <nav
    ref="navEl"
    class="tabbar px"
    data-testid="tabbar"
    :data-zone="focusZone"
    @mouseleave="blurTabs()"
  >
    <button
      v-for="(t, i) in TABS"
      :key="t.id"
      class="tab focusable mini"
      :class="{ on: activeTab === t.id, 'is-focused': focusZone === 'tabs' && tabIndex === i }"
      :data-testid="`tab-${t.id}`"
      @mouseenter="hoverTab(i)"
      @click="clickTab(i)"
    >
      <span class="tab-en">{{ t.en }}</span>
      <span class="tab-cn">{{ t.label }}</span>
    </button>

    <span class="tabbar-tail">
      <span class="hint">Q / E 切页 · ↑ 回到标签栏 · ↓ 回到内容</span>
    </span>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 0 18px;
  border-bottom: 3px solid var(--blue-400);
  background: var(--paper-alt);
  flex: 0 0 auto;
}

.tab {
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 16px 4px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  border-bottom: none;
  color: var(--ink-soft);
  cursor: pointer;
  /* 未选中的标签往下沉 2px，像真的文件夹页签 */
  margin-bottom: -3px;
  transform: translateY(2px);
}

.tab-en {
  color: var(--ink-faint);
}

.tab-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.tab.on {
  background: var(--blue-500);
  border-color: var(--blue-600);
  color: var(--paper);
  transform: translateY(0);
  padding-bottom: 6px;
}

.tab.on .tab-en,
.tab.on .tab-cn {
  color: var(--paper);
}

/* 焦点态由全站唯一的 .focusable.is-focused 提供（浅蓝底 + 两侧闪烁方块） */
.tab.is-focused {
  color: var(--ink);
}

.tab.on.is-focused {
  background: var(--blue-400);
}

.tabbar-tail {
  margin-left: auto;
  padding-bottom: 6px;
  font-size: 12px;
}

@media (max-width: 720px) {
  .tabbar-tail {
    display: none;
  }
}
</style>
