<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { setSound } from '@/config/prefs'
import { onPad } from '@/input/pad'
import { setScope } from '@/input/scopes'
import { playSfx, previewSfx } from '@/input/sfx'

/**
 * 首次进入的音效询问 —— 样子与行为都照搬样机（App.vue 里那段 `.prompt`）。
 *
 * 它为什么值得做成一个独立组件：它是**输入等价性**最小的完整样本 ——
 * 一次真实的选择、两条独立的操作路径、一个模态作用域，正好把 P2 的输入内核
 * 从头到尾跑一遍：
 *   · 键盘：← →（或 ↑ ↓）换选项、ENTER 确认、ESC 走「保持静音」
 *   · 鼠标：划过即挪同一个焦点（静音）、点击即确认
 *   · 模态：打开时把作用域切到 pause，背后场景收不到按键（第二趟派发也据此让位）
 *   · 音频：必须在用户手势里启动，所以「开启」当场试听一声，反过来验证音效链路是通的
 *
 * 默认关闭：不问就直接出声是打扰；而且浏览器本来也要求先有手势。
 */
const emit = defineEmits<{ (e: 'close'): void }>()

/** 0 = 开启音效，1 = 保持静音 */
const focus = ref(0)

const options = computed(() => [
  { label: '▶ 开启音效', enable: true, testId: 'prompt-on' },
  { label: '保持静音', enable: false, testId: 'prompt-off' },
])

function choose(enable: boolean): void {
  setSound(enable)
  if (enable) previewSfx('confirm')
  emit('close')
}

let releaseScope: (() => void) | null = null
let offPad: (() => void) | null = null

onMounted(() => {
  // 模态作用域：背后场景的监听器这一段时间收不到任何按键
  releaseScope = setScope('pause')

  offPad = onPad((action) => {
    if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
      focus.value = focus.value === 0 ? 1 : 0
      playSfx('move')
      return true
    }
    if (action === 'confirm') {
      choose(focus.value === 0)
      return true
    }
    if (action === 'cancel') {
      choose(false)
      return true
    }
    return false
  }, 'pause')
})

onUnmounted(() => {
  offPad?.()
  releaseScope?.()
})
</script>

<template>
  <div
    class="prompt-mask"
    data-testid="sound-prompt"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sound-prompt-title"
  >
    <div class="prompt px">
      <div id="sound-prompt-title" class="prompt-title">音效检查</div>

      <p class="prompt-text">
        本站有 8bit 音效（光标移动 / 确认 / 点赞 / 转场）。<br />
        要开启吗？随时可在菜单里更改。
      </p>

      <div class="prompt-actions">
        <!-- 鼠标路径：划过挪同一个焦点（静音），点击即确认 -->
        <button
          v-for="(option, index) in options"
          :key="option.testId"
          class="prompt-btn focusable mini"
          :data-testid="option.testId"
          :class="{ on: focus === index, 'is-focused': focus === index }"
          @mouseenter="focus = index"
          @click="choose(option.enable)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="prompt-keys hint">←→ 选择 · ENTER 确认 · ESC 保持静音</div>
    </div>
  </div>
</template>

<style scoped>
.prompt-mask {
  position: absolute;
  inset: 0;
  z-index: 220;
  background: var(--veil);
  display: grid;
  place-items: center;
  padding: 20px;
}

.prompt {
  width: min(460px, 100%);
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-600);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 16px 18px;
}

.prompt-title {
  font-size: var(--px-md);
  color: var(--blue-600);
  border-bottom: var(--border-thin) solid var(--blue-300);
  padding-bottom: 6px;
  margin-bottom: 10px;
}

.prompt-text {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13.5px;
  line-height: 1.9;
  margin: 0 0 14px;
  color: var(--ink);
}

.prompt-actions {
  display: flex;
  gap: 8px;
}

.prompt-btn {
  flex: 1;
  font: inherit;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  color: var(--ink);
  padding: 10px 8px;
  cursor: pointer;
}

.prompt-btn.on {
  border-color: var(--blue-500);
}

.prompt-keys {
  margin-top: 10px;
}
</style>
