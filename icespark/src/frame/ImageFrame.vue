<script setup lang="ts">
/**
 * 图片容器：像素画框
 *
 * 素材不可能都是像素图，所以「统一像素感」靠容器而不是靠改图：
 * - 硬边描边 + 内凹立体边（全站 bevel 语言）
 * - 画框上叠一层 3px 抖动网点，把真照片也拉进点阵世界
 *
 * **没有图就什么都不渲染**（用户第七轮第 1 条：空画框依然太丑）。
 * 这里不再自己造占位图案 —— 缺图不是「图的问题」，是**卡片布局的问题**：
 * 没有封面的文章换一套版式（文字卡），而不是在图片位里塞一个记号。
 * 因此调用方要用 `v-if` 决定是否渲染本组件，并用 `@error` 知道图是不是真的挂了。
 *
 * 试过但都没用的方案（留档，省得下次再撞）：
 *   1. 同尺寸抖动马赛克块 —— 与真封面并排时像「图挂了」；
 *   2. 空画框记号（外框 + 方块太阳 + 地平线）—— 语义清楚，但用户仍然觉得丑：
 *      问题的根不在画什么图案，而在**留了一个空的图片位**；
 *   3. 放大标题首字做水印 —— `ArkPixel` 是按 12px 设计的点阵字体，
 *      放大到 94px 后笔画被拉开、边缘再被灰度抗锯齿糊住，一个字会被看成两团碎块。
 */
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    /** 画框宽高比，默认 16:9（各页面按卡片版式传值） */
    ratio?: string
  }>(),
  { alt: '', ratio: '16 / 9' },
)

const emit = defineEmits<{ (e: 'error'): void }>()

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

/** 图挂了也要告诉调用方：卡片据此换成「文字卡」版式，而不是留一块空白 */
function onError() {
  failed.value = true
  emit('error')
}
</script>

<template>
  <!-- 只有真的有图才渲染画框；没有图时整个组件什么都不输出 -->
  <span
    v-if="src && !failed"
    class="img-frame"
    :style="{ aspectRatio: ratio }"
    data-testid="img-frame"
  >
    <img :src="src" :alt="alt" loading="lazy" decoding="async" @error="onError" />
  </span>
</template>
