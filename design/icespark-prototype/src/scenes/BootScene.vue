<script setup lang="ts">
/**
 * BOOT 场景：开机自检
 *
 * 反传统入场：不是 Hero 大图，而是一台机器在启动。
 * 自检播完【自动进入主页】，不需要用户按键（按任意键可跳过）。
 * 底色为白 + 浅蓝，不铺深色（深色只留给文字）。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { onPad, usePad } from '../ui/pad'
import { finishBoot } from '../ui/scene'
import { loadStats, dataSource } from '../data/api'

usePad()

const STEP_INTERVAL = 240
const lines = ref<string[]>([])
const bootDone = ref(false)
const progress = ref(0)
let entered = false

const LOG = [
  'SYNTHSPARK BIOS  v1.0',
  'MEMORY CHECK ....... 64K OK',
  'SCANNING AGENTS .... OK',
  'MOUNTING PAGES ..... OK',
]

let timers: number[] = []

/**
 * 结束开机自检：只允许进一次。
 * 开机不是一条路由，因此不会在浏览器历史里留下「开机页」，后退不会退回到自检画面；
 * 深链接（如 /post/xxx）也在这一刻被解析 —— 自检播完直接落在用户要的那一页。
 */
function goHome(skip = false) {
  if (entered) return
  entered = true
  finishBoot(skip)
}

onMounted(() => {
  loadStats()
  LOG.forEach((line, i) => {
    timers.push(
      window.setTimeout(() => {
        lines.value = [...lines.value, line]
        progress.value = Math.round(((i + 1) / LOG.length) * 100)
      }, i * STEP_INTERVAL),
    )
  })
  // 自检播完 → 短暂停留 → 自动进入主页
  timers.push(window.setTimeout(() => (bootDone.value = true), LOG.length * STEP_INTERVAL))
  timers.push(window.setTimeout(() => goHome(false), LOG.length * STEP_INTERVAL + 520))
})

onUnmounted(() => {
  timers.forEach((t) => window.clearTimeout(t))
})

// 按任意键可跳过开机动画（消费掉，避免同一次按键又触发页面里的其它行为）
const off = onPad(() => {
  goHome(true)
  return true
})
onUnmounted(off)
</script>

<template>
  <div class="boot px">
    <div class="boot-head">
      <span>ICESPARK · SYNTHSPARK</span>
      <span class="boot-ver">BIOS v1.0</span>
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
      <div class="boot-cta">
        <span class="blink">▶</span>
        正在进入主页
        <span class="src-tag">{{ dataSource === 'live' ? 'LIVE DATA' : 'DEMO DATA' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.boot {
  min-height: 100%;
  /* 白 + 浅蓝：不铺深色底 */
  background: var(--paper);
  color: var(--ink);
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
  color: var(--ink-soft);
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 10px;
}

.boot-ver {
  color: var(--blue-600);
}

.boot-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  color: var(--ink);
}

.boot-line {
  display: flex;
  gap: 8px;
}

.boot-mark {
  color: var(--blue-500);
}

.boot-foot {
  border-top: 2px solid var(--blue-300);
  padding-top: 16px;
}

.boot-bar {
  position: relative;
  height: 28px;
  border: 2px solid var(--blue-400);
  background: var(--blue-100);
  padding: 3px;
}

.boot-bar-fill {
  height: 100%;
  background: var(--blue-400);
  transition: width 160ms steps(4, end);
}

.boot-bar-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ink);
  mix-blend-mode: multiply;
}

.boot-cta {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--blue-600);
}

.src-tag {
  margin-left: auto;
  color: var(--ink-faint);
  border: 1px solid var(--blue-300);
  padding: 1px 6px;
}
</style>
