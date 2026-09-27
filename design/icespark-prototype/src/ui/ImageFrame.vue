<script setup lang="ts">
/**
 * 图片容器：像素画框
 *
 * 素材不可能都是像素图，所以「统一像素感」靠容器而不是靠改图：
 * - 硬边描边 + 内凹立体边（全站 bevel 语言）
 * - 画框上叠一层 3px 抖动网点，把真照片也拉进点阵世界
 * - 无封面时用同尺寸抖动图案占位，**高度与有封面时完全一致**，
 *   因此列表里「有封面 / 无封面」混排时网格不会参差（用户反馈第 6 条）
 */
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    /** 画框宽高比，默认 16:9；fill=true 时忽略它，改为撑满父容器 */
    ratio?: string
    /** 撑满父容器高度，而不是按宽高比自适应（列表卡片用它保证封面区高度一致） */
    fill?: boolean
    /** 无封面时角标文案 */
    emptyLabel?: string
  }>(),
  { alt: '', ratio: '16 / 9', fill: false, emptyLabel: '无封面' }
)

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false)
)

const frameStyle = computed(() => (props.fill ? { height: '100%' } : { aspectRatio: props.ratio }))
</script>

<template>
  <div class="img-frame" :style="frameStyle" data-testid="img-frame">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <div v-else class="img-fallback" aria-hidden="true" />
    <span v-if="!src || failed" class="img-label">{{ emptyLabel }}</span>
  </div>
</template>

<style scoped>
.img-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 2;
  padding: 1px 5px;
  border: 1.5px solid var(--blue-400);
  background: var(--paper);
  color: var(--ink-faint);
  font-size: 10px;
}
</style>
