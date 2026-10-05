<script setup lang="ts">
/**
 * PixelAvatar：把任意头像经 canvas 降采样 + 色彩量化，统一成「机器居民」
 * 这是全站统一视觉的关键一环：无论原图多现代，进站后都是同一台机器的像素公民
 *
 * 三档取值，**优先级就是参数顺序**（架构 §67）：
 *   1. `src` —— 后端记住的图片头像（`users.avatar_url`），先降采样再量化；
 *   2. `rows` —— icespark 自己那份点阵头像（十六行 × 十六个调色板下标），直接铺格子；
 *   3. 都没有 —— 名字哈希出来的那张脸（`drawFallback`）。
 * 前两档同时传进来时**图片优先**，这条规则只写在这里一处，调用方不必各自判断。
 *
 * 与样机的唯一差异：生产版 tsconfig 开了 `noUncheckedIndexedAccess`，
 * `palette[i]` 与像素数组下标会被推断成 `T | undefined`，因此下面补了 9 个 `!`。
 * 这些断言**纯属类型层**（下标由调色板非空契约与循环边界保证），运行时与样机逐行一致。
 */
import { ref, watch, onMounted } from 'vue'

import { GRID_COLS, GRID_ROWS, rowToIndexes, type AvatarRows } from './pixel-grid'

const props = withDefaults(
  defineProps<{
    src?: string | null
    /** icespark 自己的点阵头像（十六行 × 十六个字符） */
    rows?: AvatarRows | null
    name: string
    /** 输出像素尺寸（正方形） */
    size?: number
    /** 显示尺寸 */
    display?: number
    palette: string[]
  }>(),
  { size: 16, display: 48 },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)

/** 无头像时：用名字哈希生成一台机器的「身份图案」 */
function hashHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return h
}

/**
 * 点阵头像：把字符换成调色板下标直接铺 —— 不解码图片、不再量化一次，
 * 它本来就是量化之后的东西。
 */
function drawGrid(ctx: CanvasRenderingContext2D, s: number) {
  const rows = props.rows ?? []
  ctx.fillStyle = props.palette[0]!
  ctx.fillRect(0, 0, s, s)
  // size 允许是 16 的整数倍（32 / 48）；不是整数倍时按 1 格 = 1 像素铺，绝不半格
  const cell = Math.max(1, Math.floor(s / GRID_ROWS))
  for (let y = 0; y < GRID_ROWS; y++) {
    const indexes = rowToIndexes(rows[y])
    for (let x = 0; x < GRID_COLS; x++) {
      const color = props.palette[indexes[x] ?? 0] ?? props.palette[0]!
      ctx.fillStyle = color
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
}

function drawFallback(ctx: CanvasRenderingContext2D, s: number) {
  const h = hashHue(props.name)
  ctx.fillStyle = props.palette[0]!
  ctx.fillRect(0, 0, s, s)
  ctx.fillStyle = props.palette[props.palette.length - 1]!
  // 用位运算生成对称的「机器人面孔」，保证同一名字每次一致
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s / 2; x++) {
      const bit = (h >> ((x + y) % 12)) & 1
      const edge = x === 0 || y === 0 || y === s - 1 ? 0 : bit
      if (edge) {
        ctx.fillRect(x, y, 1, 1)
        ctx.fillRect(s - 1 - x, y, 1, 1)
      }
    }
  }
  // 面部留出「眼睛」，避免图案糊成一团
  ctx.fillStyle = props.palette[0]!
  ctx.fillRect(2, Math.floor(s / 2) - 2, s - 4, 4)
  ctx.fillStyle = props.palette[props.palette.length - 1]!
  ctx.fillRect(3, Math.floor(s / 2) - 1, 2, 2)
  ctx.fillRect(s - 5, Math.floor(s / 2) - 1, 2, 2)
}

/** 把 rgb 量化到最近的调色板颜色（像素风的色彩纪律） */
function quantize(r: number, g: number, b: number): string {
  let best = props.palette[0]!
  let bestD = Infinity
  for (const hex of props.palette) {
    const cr = parseInt(hex.slice(1, 3), 16)
    const cg = parseInt(hex.slice(3, 5), 16)
    const cb = parseInt(hex.slice(5, 7), 16)
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (d < bestD) {
      bestD = d
      best = hex
    }
  }
  return best
}

/** 三档优先级只在这一个函数里判：图片 → 点阵 → 名字回退 */
function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const s = props.size
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false

  if (!props.src) {
    if (props.rows?.length) drawGrid(ctx, s)
    else drawFallback(ctx, s)
    return
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    // 先缩到 s×s（关掉平滑 = 硬采样）
    ctx.clearRect(0, 0, s, s)
    ctx.drawImage(img, 0, 0, s, s)
    try {
      const data = ctx.getImageData(0, 0, s, s)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]! < 128) {
          px[i] = px[i + 1] = px[i + 2] = 255
          px[i + 3] = 255
          continue
        }
        const c = quantize(px[i]!, px[i + 1]!, px[i + 2]!)
        px[i] = parseInt(c.slice(1, 3), 16)
        px[i + 1] = parseInt(c.slice(3, 5), 16)
        px[i + 2] = parseInt(c.slice(5, 7), 16)
        px[i + 3] = 255
      }
      ctx.putImageData(data, 0, 0)
    } catch {
      // 跨域图片无法读像素时，保留降采样结果（依然是像素风）
    }
  }
  // 图片挂了就退到下一档（点阵），而不是一路掉到名字哈希
  img.onerror = () => {
    if (props.rows?.length) drawGrid(ctx, s)
    else drawFallback(ctx, s)
  }
  img.src = props.src
}

onMounted(render)
// rows 也要在监听的清单里：点阵头像换一块，画布得跟着重画
watch(() => [props.src, props.rows, props.name, props.size], render)
</script>

<template>
  <canvas
    ref="canvasRef"
    class="pixel-avatar bevel"
    :style="{ width: `${display}px`, height: `${display}px` }"
    :title="name"
  />
</template>

<style scoped>
.pixel-avatar {
  display: block;
  /* 关键：像素画布放大时必须硬边缘 */
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  background: var(--paper);
}
</style>
