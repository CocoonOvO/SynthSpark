<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import StatusBar from '@/machine/StatusBar.vue'
import { SCALE } from '@/styles/tokens'

/**
 * icespark 应用外壳。
 *
 * 职责（P1 只做外壳与皮肤，导航与输入层在 P2、场景在 P3）：
 * - 唯一的屏幕：3px 像素外框 + CRT 质感（扫描线 / 荫罩 / 暗角 / 开机亮线）
 * - 底部状态行：左侧软键槽 + 右侧必要页脚（外框在则它在）
 * - 场景出口：`RouterView`（画面归路由，URL 归 vue-router）
 *
 * 塑料机身外壳已移除，画面即屏幕 —— 所以这里没有第二层边框，
 * 屏幕外框本身就是最外层的框，外框下边框内侧就是页脚该待的地方。
 */
/** 开机瞬间的显像管亮线动画（样机的开机观感，640ms 后交给正常画面） */
const poweringOn = ref(true)

let bootTimer = 0

onMounted(() => {
  bootTimer = window.setTimeout(() => (poweringOn.value = false), SCALE.motion.boot)
})

onUnmounted(() => {
  window.clearTimeout(bootTimer)
})
</script>

<template>
  <!--
    data-motion 现在恒为 on：样机里的「设置 → 动效」开关属于 P2 的设置对话框，
    关掉后的表现（焦点常亮、动画停用）已经写在 pixel.css / crt.css 里等着接。
  -->
  <div class="app" data-motion="on">
    <div class="screen crt crt-flicker" :class="{ 'crt-on': poweringOn }" data-testid="screen">
      <div class="screen-inner">
        <RouterView />
      </div>

      <!-- 状态行在外框内、所有场景之下：页脚与外框绑定 -->
      <StatusBar />
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  background: var(--paper-alt);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
  overflow: hidden;
}

/* 屏幕：唯一的画布 */
.screen {
  flex: 1;
  position: relative;
  border: var(--border-frame) solid var(--edge);
  background: var(--paper);
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
}

.screen-inner {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
}

.screen-inner > * {
  flex: 1 1 auto;
  min-height: 100%;
}
</style>
