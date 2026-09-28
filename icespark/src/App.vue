<script setup lang="ts">
/**
 * 外壳根组件。
 *
 * 画面即屏幕（机壳已移除），所以这里不做任何边框或装饰：
 * 视觉全部由 scene 的 data-scene 属性 + styles 负责，
 * 本组件只保留一个出口 —— RouterView。
 */
</script>

<template>
  <RouterView />
</template>
