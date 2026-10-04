<template>
  <!--
    「放大编辑」的图标：两个对角括号 + 一条对角线（就是常见的「全屏 / 展开」那个形状）。
    为什么用 SVG 而不是字符：像素字体只有中英文常见字形，`⤢` 这类符号要不到字形，
    会掉成豆腐块；SVG 还顺带跟着字号与 `currentColor` 走，不用为每个尺寸重画。
  -->
  <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2.5 6.5V2.5h4" />
    <path d="M13.5 9.5v4h-4" />
    <path d="M3.2 3.2l3.4 3.4" />
    <path d="M12.8 12.8l-3.4-3.4" />
  </svg>
</template>

<style scoped>
.glyph {
  display: block;
  width: 1em;
  height: 1em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: square;
}
</style>
