<script setup lang="ts">
/**
 * START 暂停菜单
 *
 * 老游戏里任何时候都能按 START 呼出的那个东西，恰好补上 web 最缺的一样：
 * 全局导航。它一次解决三件事：
 *  1. 没有全局导航栏 → 这里返回主菜单、去搜索
 *  2. 全局设置的唯一入口 → 信号旋钮、音效开关
 *  3. 输入等价性兜底 → 键盘 P / Esc，鼠标点 START 软按键
 *
 * 交互：
 *  - ↑↓ 移动焦点（出声）
 *  - ←→ 调节当前行（信号档 / 音效），或鼠标点分段
 *  - Enter/Space 确认
 *  - Esc/P 关闭
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onPad, activeScope, type PadAction } from './pad'
import { useFocusGroup } from './focus'
import { playSfx, previewSfx } from './sfx'
import {
  signalLevel,
  soundEnabled,
  setSignal,
  setSound,
  SIGNAL_LABELS,
  SIGNAL_DESC,
} from './prefs'
import { resetScene, popScene, canGoBack } from './scene'

const emit = defineEmits<{ (e: 'close'): void; (e: 'search'): void }>()

interface Row {
  id: string
  en: string
  cn: string
  kind: 'action' | 'signal' | 'sound'
  disabled?: boolean
}

const ROWS: Row[] = [
  { id: 'resume', en: 'RESUME', cn: '继续游戏', kind: 'action' },
  { id: 'search', en: 'SEARCH', cn: '检索（下一轮实现）', kind: 'action', disabled: true },
  { id: 'signal', en: 'SIGNAL', cn: '信号强度', kind: 'signal' },
  { id: 'sound', en: 'SOUND', cn: '音效', kind: 'sound' },
  { id: 'title', en: 'TITLE', cn: '返回主菜单', kind: 'action' },
]

const focus = useFocusGroup()
const hint = ref('')

const current = computed(() => ROWS[focus.index.value])

/** 调节当前行（←→ 或点击分段） */
function adjust(dir: 1 | -1) {
  const row = current.value
  if (!row) return false
  if (row.kind === 'signal') {
    const next = Math.max(0, Math.min(3, signalLevel.value + dir))
    if (next === signalLevel.value) return false
    setSignal(next)
    playSfx('move')
    return true
  }
  if (row.kind === 'sound') {
    setSound(!soundEnabled.value)
    if (soundEnabled.value) previewSfx('confirm')
    return true
  }
  return false
}

/** 确认当前行 */
function activate() {
  const row = current.value
  if (!row || row.disabled) {
    if (row?.disabled) hint.value = '该功能将在下一轮实现'
    return false
  }
  if (row.kind === 'signal' || row.kind === 'sound') {
    adjust(1)
    return true
  }
  playSfx('confirm')
  if (row.id === 'resume') {
    emit('close')
  } else if (row.id === 'search') {
    emit('search')
  } else if (row.id === 'title') {
    resetScene('shake')
    emit('close')
  }
  return true
}

function onAction(a: PadAction): boolean {
  if (a === 'up') {
    if (!focus.moveBy(-1, ROWS.length)) hint.value = ''
    return true
  }
  if (a === 'down') {
    if (!focus.moveBy(1, ROWS.length)) hint.value = ''
    return true
  }
  if (a === 'left') return adjust(-1) || true
  if (a === 'right') return adjust(1) || true
  if (a === 'confirm') return activate()
  if (a === 'cancel' || a === 'start') {
    emit('close')
    return true
  }
  return false
}

// 打开期间把输入作用域切到 pause，避免按键穿透到背后的场景
const prevScope = activeScope.value
activeScope.value = 'pause'

const off = onPad(onAction, 'pause')

onUnmounted(() => {
  activeScope.value = prevScope === 'pause' ? 'scene' : prevScope
  off()
})

onMounted(() => {
  hint.value = ''
})

/** 鼠标：划过即共享焦点（静音），点击即确认 */
function hoverRow(i: number) {
  focus.hover(i)
}
function clickRow(i: number) {
  const row = ROWS[i]
  if (row?.disabled) {
    focus.set(i, true)
    hint.value = '该功能将在下一轮实现'
    return
  }
  // 点击可调节行直接切换，点击动作行直接执行
  focus.set(i, true)
  activate()
}
</script>

<template>
  <div class="pause-mask" data-testid="pause">
    <div class="pause px">
      <div class="pause-head">
        <span class="pause-title">PAUSED</span>
        <span class="pause-sub">按 START / P 关闭</span>
      </div>

      <div class="pause-rows">
        <button
          v-for="(row, i) in ROWS"
          :key="row.id"
          class="row"
          :data-row="row.id"
          :class="{ focused: focus.index.value === i, disabled: row.disabled }"
          @mouseenter="hoverRow(i)"
          @click="clickRow(i)"
        >
          <span class="row-en">{{ row.en }}</span>
          <span class="row-cn">{{ row.cn }}</span>

          <!-- 信号行：4 段刻度，鼠标可直接点 -->
          <span v-if="row.kind === 'signal'" class="seg" @click.stop>
            <b
              v-for="n in 4"
              :key="n"
              class="seg-cell"
              :class="{ on: signalLevel === n - 1 }"
              :data-seg="n - 1"
              @click.stop="((setSignal(n - 1)), playSfx('move'))"
            >
              {{ n - 1 }}
            </b>
          </span>

          <!-- 音效行：ON/OFF -->
          <span v-else-if="row.kind === 'sound'" class="seg" @click.stop>
            <b
              class="seg-cell"
              :class="{ on: !soundEnabled }"
              data-seg="off"
              @click.stop="setSound(false)"
            >
              OFF
            </b>
            <b
              class="seg-cell"
              :class="{ on: soundEnabled }"
              data-seg="on"
              @click.stop="((setSound(true)), previewSfx('confirm'))"
            >
              ON
            </b>
          </span>

          <span v-else class="row-arrow">▶</span>
        </button>
      </div>

      <!-- 信号档说明：让这个旋钮的意义可见 -->
      <div class="pause-note">
        <span class="note-tag">SIGNAL {{ signalLevel }} · {{ SIGNAL_LABELS[signalLevel] }}</span>
        <span class="note-text">{{ SIGNAL_DESC[signalLevel] }}</span>
      </div>

      <div class="pause-foot">
        <span>↑↓ 移动</span>
        <span>←→ 调节</span>
        <span>A/ENTER 确认</span>
        <span>B/ESC 关闭</span>
        <span v-if="canGoBack" class="foot-back" @click="((popScene('wipe')), emit('close'))">
          直接返回上一场景
        </span>
      </div>

      <div v-if="hint" class="pause-hint blink">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.pause-mask {
  position: absolute;
  inset: 0;
  z-index: 200;
  background: rgba(18, 58, 82, 0.28);
  display: grid;
  place-items: center;
  padding: 20px;
}

.pause {
  width: min(560px, 100%);
  background: var(--paper);
  border: 3px solid var(--blue-600);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 18px 20px 16px;
}

.pause-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.pause-title {
  font-size: 24px;
  color: var(--blue-600);
}

.pause-sub {
  color: var(--ink-faint);
}

.pause-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--blue-200);
  padding: 9px 10px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.row.focused {
  background: var(--blue-200);
  border-left: 8px solid var(--blue-500);
  padding-left: 4px;
}

.row.disabled {
  color: var(--ink-faint);
}

.row-en {
  min-width: 110px;
  color: var(--blue-600);
}

.row.focused .row-en {
  color: var(--blue-700);
}

.row-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 14px;
  font-weight: 700;
}

.row-arrow {
  margin-left: auto;
  color: var(--blue-500);
}

/* 分段控件：信号档与音效开关共用 */
.seg {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.seg-cell {
  font-weight: 400;
  border: 2px solid var(--blue-400);
  background: var(--paper);
  color: var(--ink-soft);
  padding: 1px 8px;
  cursor: pointer;
  min-width: 26px;
  text-align: center;
}

.seg-cell.on {
  background: var(--blue-500);
  border-color: var(--blue-600);
  color: var(--paper);
}

.pause-note {
  margin-top: 12px;
  background: var(--blue-100);
  border: 2px solid var(--blue-200);
  padding: 8px 10px;
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}

.note-tag {
  color: var(--blue-600);
}

.note-text {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12px;
  color: var(--ink-soft);
}

.pause-foot {
  margin-top: 12px;
  border-top: 2px solid var(--blue-300);
  padding-top: 8px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--ink-faint);
}

.foot-back {
  margin-left: auto;
  cursor: pointer;
  color: var(--blue-600);
  border-bottom: 1px solid var(--blue-400);
}

.pause-hint {
  margin-top: 8px;
  color: var(--spark);
}
</style>
