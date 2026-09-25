<script setup lang="ts">
/**
 * BOOT 场景：开机自检
 * 反传统入场：不是 Hero 大图，而是一台机器在启动
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { pushScene, useStatusBar } from '../ui/scene'
import { store, loadStats, dataSource } from '../data/api'

usePad()
const { clock, stop } = useStatusBar()

const STEP_INTERVAL = 320
const lines = ref<string[]>([])
const bootDone = ref(false)
const progress = ref(0)

const LOG = [
  'SYNTHSPARK BIOS  v1.0',
  'MEMORY CHECK ....... 64K OK',
  'SCANNING AGENTS ....',
  'LOADING WORLD ......',
]

let timers: number[] = []

onMounted(async () => {
  loadStats()
  LOG.forEach((line, i) => {
    timers.push(
      window.setTimeout(() => {
        lines.value = [...lines.value, line]
        progress.value = Math.round(((i + 1) / LOG.length) * 100)
      }, i * STEP_INTERVAL),
    )
  })
  timers.push(
    window.setTimeout(() => {
      bootDone.value = true
    }, LOG.length * STEP_INTERVAL + 240),
  )
})

onUnmounted(() => {
  timers.forEach((t) => window.clearTimeout(t))
  stop()
})

const off = onPad((a) => {
  if ((a === 'confirm' || a === 'up' || a === 'down') && bootDone.value) start()
})

onUnmounted(off)

function start() {
  pushScene('title', undefined, 'flash')
}
</script>

<template>
  <div class="boot invert px">
    <div class="boot-head">
      <span>{{ clock }}</span>
      <span>ICESPARK · SYNTHSPARK</span>
      <span>BAT [████] 100%</span>
    </div>

    <div class="boot-body">
      <div v-for="(l, i) in lines" :key="i" class="boot-line">
        <span class="boot-mark">▸</span>{{ l }}
      </div>
      <div v-if="!bootDone" class="boot-line blink">▌</div>
    </div>

    <div class="boot-foot">
      <div class="boot-bar">
        <div class="boot-bar-fill" :style="{ width: `${progress}%` }" />
        <span class="boot-bar-label">LOADING {{ progress }}%</span>
      </div>
      <div v-if="bootDone" class="boot-cta px">
        <span class="blink">▶</span>
        PRESS <em>START</em> / 按 A 键开始
        <span class="src-tag">{{ dataSource === 'live' ? 'LIVE DATA' : 'DEMO DATA' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.boot {
  min-height: 100%;
  background: var(--ink);
  color: var(--paper);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px 32px;
  cursor: pointer;
}

.boot-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
  letter-spacing: 0.14em;
  border-bottom: 2px solid var(--paper);
  padding-bottom: 10px;
}

.boot-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  font-size: 15px;
  letter-spacing: 0.1em;
}

.boot-line {
  display: flex;
  gap: 8px;
}

.boot-mark {
  opacity: 0.6;
}

.boot-foot {
  border-top: 2px solid var(--paper);
  padding-top: 16px;
}

.boot-bar {
  position: relative;
  height: 28px;
  border: 2px solid var(--paper);
  padding: 3px;
}

.boot-bar-fill {
  height: 100%;
  background: var(--paper);
  transition: width 160ms steps(4, end);
}

.boot-bar-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  letter-spacing: 0.2em;
  mix-blend-mode: difference;
}

.boot-cta {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  letter-spacing: 0.16em;
}

.boot-cta em {
  font-style: normal;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.src-tag {
  margin-left: auto;
  font-size: 10px;
  border: 1px solid var(--paper);
  padding: 1px 6px;
  opacity: 0.7;
}
</style>
