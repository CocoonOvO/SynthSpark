<script setup lang="ts">
/**
 * PixelDialog：RPG 对话框
 *
 * 全站所有输入与提示都在这里发生（取代 toast / modal / 下拉菜单）。
 * - 逐字打字机出字
 * - 出完显示 ▼ 闪烁三角
 * - A 键推进 / 关闭，B 键取消
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { onPad, useTypewriter } from './pad'

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

onMounted(() => {
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
  })
})

onUnmounted(() => off?.())

watch(
  () => props.lines,
  () => showPage(0),
)
</script>

<template>
  <div class="dialog-wrap px" @click="advance">
    <div class="dialog bevel">
      <!-- 鼠标路径的显式出口：键盘是 Esc，鼠标需要一个能点的关闭键 -->
      <button class="dialog-close" @click.stop="emit('close')">✕ 关闭</button>
      <div v-if="speaker" class="dialog-speaker">{{ speaker }}</div>
      <p class="dialog-text read">
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
