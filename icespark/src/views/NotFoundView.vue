<script setup lang="ts">
import { useRoute } from 'vue-router'

/**
 * 404 兜底页：P0 先要能证明「未知路径不会白屏」，像素皮在 P3 补。
 *
 * 根节点用 `<div>` 而不是 `<main>`：地标由外壳的 `.screen-inner` 提供，
 * 页面里再放一个 `<main>` 会出现两个 main 地标（axe 的 landmark 规则会拦）。
 */
const route = useRoute()
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>这个地址没有对应的页面：{{ route.fullPath }}</p>
    <p><RouterLink to="/">回到首页</RouterLink></p>
  </div>
</template>
