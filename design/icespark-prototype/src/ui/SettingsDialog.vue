<script setup lang="ts">
/**
 * 设置弹窗（登录后才在暂停菜单里出现，但与暂停菜单是同级独立弹窗）
 *
 * 三档开关：音效 / 每页条数 / 动效。
 * 信号强度已按用户要求**从设置里移除**，全站固定用最高档（只在该弹窗脚注里说明一句）。
 *
 * 输入等价性：
 * - 键盘：↑↓ 选行，←→ 改值，A/Enter 切换，B/ESC 关闭
 * - 鼠标：划过选行（静音）、点击改值
 */
import { computed, onUnmounted, ref } from 'vue'
import { onPad } from './pad'
import { playSfx, previewSfx } from './sfx'
import {
  soundEnabled,
  setSound,
  pageSize,
  setPageSize,
  PAGE_SIZE_OPTIONS,
  motionEnabled,
  setMotion,
  SIGNAL_LEVEL,
} from './prefs'
import { dataSource } from '../data/api'

const emit = defineEmits<{ (e: 'close'): void }>()

interface Row {
  key: string
  label: string
  value: string
  hint: string
  kind: 'toggle' | 'enum' | 'info'
}

const rows = computed<Row[]>(() => [
  {
    key: 'sound',
    label: '音效',
    value: soundEnabled.value ? '开' : '关',
    hint: '光标移动与确认的方波音；鼠标划过始终静音',
    kind: 'toggle',
  },
  {
    key: 'pageSize',
    label: '每页条数',
    value: String(pageSize.value),
    hint: '文章列表一屏显示几篇，翻页用 PgUp / PgDn',
    kind: 'enum',
  },
  {
    key: 'motion',
    label: '动效',
    value: motionEnabled.value ? '开' : '关',
    hint: '场景转场、翻页滚动、闪烁光标；关掉后功能一个不少',
    kind: 'toggle',
  },
  {
    key: 'source',
    label: '数据来源',
    value: dataSource.value === 'live' ? '实时接口' : dataSource.value === 'loading' ? '读取中' : '离线样张',
    hint: '后端 /api 可达时用真数据，否则回退内置样张',
    kind: 'info',
  },
])

const index = ref(0)

function change(i: number, dir: 1 | -1) {
  const row = rows.value[i]
  if (!row) return
  if (row.kind === 'toggle') {
    if (row.key === 'sound') {
      setSound(!soundEnabled.value)
      if (soundEnabled.value) previewSfx('confirm')
    } else if (row.key === 'motion') {
      setMotion(!motionEnabled.value)
    }
    playSfx('move')
    return
  }
  if (row.kind === 'enum') {
    const opts = PAGE_SIZE_OPTIONS as readonly number[]
    const at = opts.indexOf(pageSize.value)
    const next = opts[(at + dir + opts.length) % opts.length]
    setPageSize(next)
    playSfx('move')
  }
}

function hoverRow(i: number) {
  if (index.value !== i) {
    index.value = i
    // 鼠标路径静音
  }
}

const off = onPad((a) => {
  if (a === 'cancel') {
    emit('close')
    return true
  }
  if (a === 'up') {
    index.value = Math.max(0, index.value - 1)
    playSfx('move')
    return true
  }
  if (a === 'down') {
    index.value = Math.min(rows.value.length - 1, index.value + 1)
    playSfx('move')
    return true
  }
  if (a === 'left') {
    change(index.value, -1)
    return true
  }
  if (a === 'right' || a === 'confirm') {
    change(index.value, 1)
    return true
  }
  return false
}, 'pause')

onUnmounted(off)
</script>

<template>
  <div class="mask" data-testid="settings-dialog" @click.self="emit('close')">
    <div class="panel px">
      <div class="panel-head">
        <span class="panel-title">设置</span>
        <button class="x focusable mini" data-testid="settings-close" @click="emit('close')">✕</button>
      </div>

      <div class="rows">
        <div
          v-for="(r, i) in rows"
          :key="r.key"
          class="row focusable"
          :class="{ 'is-focused': index === i, info: r.kind === 'info' }"
          :data-testid="`set-${r.key}`"
          @mouseenter="hoverRow(i)"
          @click="((hoverRow(i)), change(i, 1))"
        >
          <span class="row-label">{{ r.label }}</span>
          <span class="row-hint hint">{{ r.hint }}</span>
          <span class="row-value">
            <span v-if="r.kind !== 'info'" class="arrow">◀</span>
            {{ r.value }}
            <span v-if="r.kind !== 'info'" class="arrow">▶</span>
          </span>
        </div>
      </div>

      <div class="keys hint">↑↓ 选行 · ←→ 改值 · A/ENTER 切换 · ESC 关闭</div>
      <div class="note hint">
        CRT 强度（信号档 {{ SIGNAL_LEVEL }}）固定为最高档，不再提供调节 —— 设置里只留真正影响使用的三项。
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 240;
  background: rgba(18, 58, 82, 0.34);
  display: grid;
  place-items: center;
  padding: 20px;
}

.panel {
  width: min(520px, 100%);
  background: var(--paper);
  border: 3px solid var(--edge);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 14px 18px 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  border-bottom: 3px solid var(--blue-300);
  padding-bottom: 8px;
}

.panel-title {
  font-size: 24px;
  color: var(--blue-600);
}

.x {
  margin-left: auto;
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--ink-soft);
  padding: 2px 8px;
  cursor: pointer;
}

.rows {
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: 2px solid var(--blue-200);
  cursor: pointer;
}

.row.info {
  cursor: default;
  background: var(--paper-alt);
}

.row-label {
  flex: 0 0 76px;
  color: var(--ink);
}

.row-hint {
  flex: 1;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12px;
  line-height: 1.6;
}

.row-value {
  flex: 0 0 auto;
  min-width: 96px;
  text-align: right;
  color: var(--blue-700);
}

.arrow {
  color: var(--blue-400);
}

.row.info .row-value {
  color: var(--ink-soft);
}

.keys {
  text-align: center;
  font-size: 12px;
}

.note {
  margin-top: 8px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 11.5px;
  line-height: 1.7;
  border-top: 2px dashed var(--blue-200);
  padding-top: 8px;
}
</style>
