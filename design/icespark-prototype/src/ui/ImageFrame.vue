<script setup lang="ts">
/**
 * 图片容器：像素画框
 *
 * 素材不可能都是像素图，所以「统一像素感」靠容器而不是靠改图：
 * - 硬边描边 + 内凹立体边（全站 bevel 语言）
 * - 画框上叠一层 3px 抖动网点，把真照片也拉进点阵世界
 * - 无封面时的处理（用户第六轮第 4 条：原来的马赛克块太丑）：
 *   改成**空画框** —— 外框 + 一颗方块太阳 + 一条地平线，
 *   用纯蓝色阶、硬边、无圆角画出来。
 *   这是「这里是图片位」的通用语义，但完全长在这套像素语言里，
 *   所以读起来是「刻意留白」，不是「图挂了」。
 *
 * 试过但没用的方案（留个记录，省得下次再撞）：
 *   把标题首字放大成水印。`ArkPixel` 是按 12px 设计的点阵字体，
 *   放大到 90px 后笔画被拉开、边缘又被灰度抗锯齿糊住，
 *   一个字会被看成两团碎块 —— 尺寸放大了，字反而读不出来。
 *
 * 尺寸上仍然与有封面时完全一致（同一个宽高比 / 同一个撑满策略），
 * 因此列表里混排时网格不会参差。
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
/** 是否走「无封面」那套空画框 */
const empty = computed(() => !props.src || failed.value)

/**
 * 画框的宽高比（数值）。
 * 空画框要按这个比例做成「画框的缩小版」：这样 3:2 的列表封面与 21:9 的首页缩略图里，
 * 记号都占各自边长的同一个百分比，不会在扁画框里显得又小又孤零零。
 */
const frameAr = computed(() => {
  const m = String(props.ratio).match(/([\d.]+)\s*\/\s*([\d.]+)/)
  const ar = m ? Number(m[1]) / Number(m[2]) : NaN
  return Number.isFinite(ar) && ar > 0 ? ar : 3 / 2
})
</script>

<template>
  <div
    class="img-frame"
    :class="{ 'is-empty': empty }"
    :style="frameStyle"
    data-testid="img-frame"
  >
    <img
      v-if="!empty"
      :src="src!"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <!-- 无封面：空画框，不是马赛克 -->
    <div v-else class="img-ph" data-testid="img-empty" aria-hidden="true">
      <span class="img-ph-box" :style="{ aspectRatio: frameAr }">
        <i class="img-ph-sun" />
        <i class="img-ph-line" />
      </span>
    </div>
    <span v-if="empty" class="img-label">{{ emptyLabel }}</span>
  </div>
</template>

<style scoped>
.img-frame {
  /* 自己作为查询容器：空画框的线宽按画框宽度算，各种宽高比都合身 */
  container-type: inline-size;
}

.img-ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background-color: var(--blue-100);
  overflow: hidden;
}

/* 空画框：外框 + 太阳 + 地平线。三个形状全是方块，圆角恒为 0。
   高度 = 画框的 56%，宽高比由组件内联给（= 画框自己的宽高比），
   也就是「画框的缩小版」。这样 3:2 的列表封面与 21:9 的首页缩略图里，
   记号占各自边长的比例一致，不会在扁画框里显得又小又孤零零。
   （宽高比走内联样式而不是自定义属性：配色门要求样式表里出现的每个 var() 都能在 :root 取到值，
   组件私有的自定义属性会被它当成「变量没定义」——那是第 4 轮那次边框消失事故留下的门。） */
.img-ph-box {
  position: relative;
  height: 56%;
  border: 3px solid var(--blue-300);
}

.img-ph-sun {
  position: absolute;
  left: 12%;
  top: 16%;
  width: 17%;
  aspect-ratio: 1;
  background: var(--blue-300);
}

.img-ph-line {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 28%;
  height: 3px;
  background: var(--blue-300);
}

@supports (container-type: inline-size) {
  /* 画框很大 / 很小时线宽跟着收放，免得细到看不见或粗到像色块 */
  .img-ph-box {
    border-width: clamp(2px, 1cqw, 5px);
  }

  .img-ph-line {
    height: clamp(2px, 1cqw, 5px);
  }
}

/* 空画框下把画框的点阵层调轻一点，免得细线被网点糊住 */
.img-frame.is-empty::after {
  background-image: radial-gradient(rgba(18, 58, 82, 0.07) 1px, transparent 1px);
  background-size: 4px 4px;
}

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
