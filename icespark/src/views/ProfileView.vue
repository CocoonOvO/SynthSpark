<script setup lang="ts">
import { onUnmounted } from 'vue'

import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'

/**
 * 个人信息编辑页（P5 占位）。
 *
 * 这一版只保证**路由 / 场景 / 外壳接线**是通的（标题、h1、底栏都在），
 * 真页面由本轮的页面任务替换掉整个文件 —— 先有文件再挂路由，
 * 否则懒加载的 import 会让整站在这个路径上白屏（路由表里引用了不存在的模块）。
 */
const { clock, stop } = useStatusBar()
onUnmounted(stop)
</script>

<template>
  <div class="view">
    <SceneHead title="个人信息 · PROFILE" :clock="clock" />
    <h1 class="page-title px px-32 px-display">个人信息编辑</h1>
    <p class="page-sub hint">施工中（P5）：昵称、头像、简介与密码。</p>
  </div>
</template>

<style scoped>
.page-title {
  margin: 24px 0 8px;
}
.page-sub {
  margin: 0;
}
</style>
