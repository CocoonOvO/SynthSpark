<script setup lang="ts">
import { useRoute } from 'vue-router'

/** 404 兜底页：P0 先要能证明「未知路径不会白屏」，像素皮在 P3 补 */
const route = useRoute()
</script>

<template>
  <main>
    <h1>404</h1>
    <p>这个地址没有对应的页面：{{ route.fullPath }}</p>
    <p><RouterLink to="/">回到首页</RouterLink></p>
  </main>
</template>
