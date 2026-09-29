<script setup lang="ts">
/**
 * PixelDialog：RPG 对话框
 *
 * 全站所有输入与提示都在这里发生（取代 toast / modal / 下拉菜单）。
 * - 逐字打字机出字
 * - 出完显示 ▼ 闪烁三角
 * - A 键推进 / 关闭，B 键取消
 *
 * 生产版与样机的三处差异（都是契约规定的机械改写或既有弹窗口径，不是新设计）：
 *
 * 1. **手势监听不再自己挂 window**。样机 `ui/pad.ts` 同时含 `onPad` 与 `useTypewriter`，
 *    生产版按 §16.1/§16.3 拆成两处：`onPad` 在 `@/input/pad`，打字机原语在 `@/signal/motion`。
 *    外壳已经挂了唯一的键盘监听器（`@/input` 的 `mountInput`），这里再挂一个就是双触发。
 *
 * 2. **作用域取 `pause`（照 PauseMenu.vue / SoundPrompt.vue）**。样机的 `onPad` 默认 `scene`，
 *    靠「把方向键全部消费掉」（见下面的注释）来挡住背后的正文。生产版不能只靠消费：
 *    `dispatchPadAction` 是**按注册顺序**把同一个按键发给所有同作用域监听器，
 *    而调用方的场景监听器注册得更早，它在对话框这轮之前就已经动过焦点了 ——
 *    正是 pad.ts 注释里点名的「一次按键走两层」。所以打开时把作用域切到 `pause`
 *    （背后场景的监听器直接收不到），关闭时归还，`onPad(..., 'pause')` 与之配对。
 *
 * 3. **补对话语义**（样机没有 aria）。`role="dialog"` + `aria-modal="true"` + 标题关联，
 *    与 machine/ 下三个既有弹窗（PauseMenu / SettingsDialog / SoundPrompt）口径一致。
 *    id 用组件内固定默认值：`pixel-dialog-title`（说话者名）与 `pixel-dialog-text`（正文）。
 *    为什么不加 `titleId` 之类的新 prop：§16.4 冻结了 props（照样机），加 prop 就是契约漂移；
 *    所以「默认值」由组件自己给，「能被调用方指定」这条留给主线裁决（见交付报告）。
 *    另：说话者名是 `v-if` 的，留空时若仍引用它会得到一个指向不存在节点的
 *    `aria-labelledby`（axe 判违规），因此留空时回退到恒定存在的正文节点。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { onPad } from '@/input/pad'
import { setScope } from '@/input/scopes'
import { useTypewriter } from '@/signal/motion'

const props = withDefaults(
  defineProps<{
    /** 说话者名字，留空则不显示名字条 */
    speaker?: string
    /** 文本内容：字符串数组表示分段，A 键逐页推进 */
    lines: string[]
    /** 是否显示 ▼ 提示 */
    waiting?: boolean
  }>(),
  { waiting: true },
)

const emit = defineEmits<{ (e: 'done'): void; (e: 'close'): void }>()

const { text, done, type, finish } = useTypewriter()
const pageIndex = ref(0)

function showPage(i: number) {
  pageIndex.value = i
  type(props.lines[i] ?? '', 24)
}

function advance() {
  if (!done.value) {
    // 出字中按 A：直接补全（老游戏的跳过手感）
    finish(props.lines[pageIndex.value] ?? '')
    return
  }
  if (pageIndex.value < props.lines.length - 1) {
    showPage(pageIndex.value + 1)
  } else {
    emit('done')
  }
}

let off: (() => void) | null = null
/** 作用域归还函数：关框时必须还回去，否则作用域永远停在 pause，新页面的按键全部石沉大海 */
let releaseScope: (() => void) | null = null

onMounted(() => {
  releaseScope = setScope('pause')
  showPage(0)
  off = onPad((a) => {
    // 模态：全部方向键都消费掉，避免对话框背后的正文跟着滚动
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return true
    if (a === 'confirm') {
      advance()
      return true
    }
    if (a === 'cancel') {
      emit('close')
      return true
    }
    return false
  }, 'pause')
})

onUnmounted(() => {
  off?.()
  releaseScope?.()
})

watch(
  () => props.lines,
  () => showPage(0),
)
</script>

<template>
  <!--
    aria-labelledby 指向哪个 id：有说话者名就用名字条（对话的自然标题），
    留空时回退到恒定存在的正文节点 —— 两条都是固定默认 id，不需要调用方传参。
  -->
  <div
    class="dialog-wrap px"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="speaker ? 'pixel-dialog-title' : 'pixel-dialog-text'"
    @click="advance"
  >
    <div class="dialog bevel">
      <!-- 鼠标路径的显式出口：键盘是 Esc，鼠标需要一个能点的关闭键 -->
      <button class="dialog-close" @click.stop="emit('close')">✕ 关闭</button>
      <div v-if="speaker" id="pixel-dialog-title" class="dialog-speaker">{{ speaker }}</div>
      <p id="pixel-dialog-text" class="dialog-text read">
        {{ text }}
        <span v-if="!done" class="blink">▌</span>
      </p>
      <span v-if="waiting && done" class="dialog-next blink">▼</span>
    </div>
    <div class="dialog-key">A / ENTER 继续　B / ESC 关闭　（或点击对话框推进）</div>
  </div>
</template>

<style scoped>
.dialog-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px;
  z-index: 60;
  cursor: pointer;
}

.dialog {
  max-width: 720px;
  margin: 0 auto;
  background: var(--paper);
  border: 4px solid var(--ink);
  padding: 20px 24px 24px;
  position: relative;
  /* 老式对话框的双层描边 */
  outline: 2px solid var(--ink);
  outline-offset: -10px;
}

.dialog-close {
  position: absolute;
  top: 6px;
  right: 6px;
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 1px 8px;
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--blue-100);
}

.dialog-speaker {
  position: absolute;
  top: -16px;
  left: 20px;
  background: var(--paper);
  border: 2px solid var(--ink);
  padding: 2px 10px;
  font-size: 12px;
  letter-spacing: 0.14em;
}

.dialog-text {
  margin: 0;
  font-size: 15.5px;
  color: var(--ink);
  min-height: 3.8em;
  line-height: 1.9;
  white-space: pre-wrap;
}

.dialog-next {
  position: absolute;
  right: 20px;
  bottom: 12px;
  font-size: 16px;
  color: var(--ink);
}

.dialog-key {
  max-width: 720px;
  margin: 8px auto 0;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
  text-align: right;
}
</style>
