<script setup lang="ts">
/**
 * 场景页头：时钟 + 页面名 + 右侧插槽。
 * 每个场景都有它，抽出来是为了让「机器铭牌」在全站长得一样。
 */
defineProps<{ title: string; clock: string }>()
</script>

<template>
  <div class="scene-head px">
    <span class="head-clock">{{ clock }}</span>
    <span class="head-title">{{ title }}</span>
    <span class="head-tail"><slot /></span>
  </div>
</template>

<style scoped>
.scene-head {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
  color: var(--ink-soft);
  flex: 0 0 auto;
}

.head-title {
  color: var(--blue-600);
}

.head-tail {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-faint);
}
</style>
