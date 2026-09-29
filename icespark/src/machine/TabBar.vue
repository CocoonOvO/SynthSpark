<script setup lang="ts">
/**
 * 8bit 标签栏
 *
 * 浏览类页面（主页 / 文章 / 关联 / 关于）并列在这个条上，取代「层层深入的页面 + 面包屑」。
 *
 * 输入等价性（用户硬要求：单独鼠标、单独键盘都能完成全部操作）：
 * - 键盘：内容区按 ↑ 顶到首行之上 → 焦点进入标签栏；←→ 移动光标；Enter 进入；↓ 或 B/ESC 退回内容区
 * - 键盘快捷：Tab / Shift+Tab 在任何有标签栏的页面上前后切页（见 App.vue 的全局键）
 * - 鼠标：划过即共享焦点（静音预览），点击直接切页；指针移出标签栏时焦点交还内容区
 *
 * 迁移自样机 `ui/TabBar.vue`（架构 §16.1：`ui/TabBar.vue` → `src/machine/TabBar.vue`），
 * 模板 / 类名 / scoped 样式 / testid 逐字照搬，只做了 §16 允许的机械改写：
 *   - `onPad` / `activeScope` 样机都从 `./pad` 取（样机的 pad 文件把输入层与作用域放在一起），
 *     生产版的这两样分居 `@/input/pad` 与 `@/input/scopes`，因此拆成两条 import；
 *   - `focusZone` 按冻结契约（§16.3）从 `@/scene/tabs` 取 —— 那是对 `@/input/scopes`
 *     同一个 ref 的重导出，只是为了「标签页三件套从一处引入」。**不新增**一份焦点分区状态。
 *   - `TABS[i]` 两处补了 `!`（`TABS[i]!.id`）：生产版 tsconfig 开了 noUncheckedIndexedAccess，
 *     照抄样机写法会报 TS2532；下标由 v-for / tabCursor 保证合法，与 `@/scene/tabs` 同因同写。
 * 样机那句「再挂一个 usePad 就是双触发」的口径在生产版同样成立：
 * 键盘监听器只有外壳 `@/input` 的 mountInput 一个，这里只用 onPad 注册处理器。
 * （下方 window 上的监听是 `pointermove`，属鼠标路径，不在键盘监听器之列。）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { onPad } from '@/input/pad'
import { activeScope } from '@/input/scopes'
import { playSfx } from '@/input/sfx'
import {
  TABS,
  activeTab,
  tabCursor,
  focusZone,
  switchTab,
  focusTabs,
  blurTabs,
  moveTabCursor,
} from '@/scene/tabs'
import { tabLabels } from '@/config/site'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()

/**
 * 页签文字走三级配置（硬要求 2）：标签栏仍是**固定四项**，
 * 配置只决定这四个标签的中文名 —— 映射规则见 `config/site.ts` 的 `tabLabels`。
 * 英文小字（HOME / POSTS / …）是外壳的机器字样，属皮肤，不进配置。
 */
const labels = computed(() => tabLabels(site.config, TABS))

const navEl = ref<HTMLElement | null>(null)

function hoverTab(i: number) {
  // 鼠标路径：静音移动焦点（共享焦点模型，不给鼠标单独一套 hover 态）
  focusTabs(i)
}

function clickTab(i: number) {
  // `!` 只为满足 tsconfig 的 noUncheckedIndexedAccess（TABS[i] 被推成 `TabDef | undefined`）：
  // i 来自 v-for，必然在 [0, TABS.length) 内。与 scene/tabs.ts 里同原因的那处写法保持一致，
  // 也比「先判空再取 id」更贴近样机的原表达式。
  const id = TABS[i]!.id
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
  // 作用域必须是场景：暂停菜单 / 设置框开着时（scope = 'pause'）标签栏不抢按键
  if (activeScope.value !== 'scene') return false
  if (focusZone.value !== 'tabs') return false
  if (a === 'left' || a === 'right') {
    moveTabCursor(a === 'left' ? -1 : 1)
    playSfx('move')
    return true
  }
  if (a === 'down' || a === 'confirm') {
    // 进入当前光标所在页，焦点交还内容区
    // （`!` 同 clickTab：tabCursor 被 moveTabCursor / focusTabs 夹在 [0, n) 内）
    if (TABS[tabCursor.value]!.id === activeTab.value) blurTabs()
    else switchTab(TABS[tabCursor.value]!.id)
    playSfx('confirm')
    return true
  }
  // 不吃 ESC：用户裁定「ESC 在每一页都能起菜单」。光标停在标签栏上也一样 ——
  // 想吃掉它去 `blurTabs()` 的话，ESC 的含义就取决于焦点在哪儿，正是被否掉的那种不可预期。
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
      :class="{ on: activeTab === t.id, 'is-focused': focusZone === 'tabs' && tabCursor === i }"
      :data-testid="`tab-${t.id}`"
      @mouseenter="hoverTab(i)"
      @click="clickTab(i)"
    >
      <span class="tab-en">{{ t.en }}</span>
      <span class="tab-cn">{{ labels[i] }}</span>
    </button>

    <span class="tabbar-tail">
      <span class="hint">TAB 切页 · ↑ 回到标签栏 · ↓ 回到内容</span>
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
