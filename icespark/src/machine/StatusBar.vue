<script setup lang="ts">
import { useSiteStore } from '@/stores/site'

/**
 * 底部状态行 —— M 层（机器质感组件）。
 *
 * 它是**外壳的一部分**，不是页脚区块（硬要求 3）：
 * 一行小字刻在外框下边框**内侧**，左边留给软按键，右边是站点的必要页脚
 * （版权 · 口号 · 备案，全部来自站点配置，管理员可改）。
 *
 * 三个约束决定了它的写法：
 *  1. **与外框绑定**：外框在则它在 —— 由 App.vue 渲染，所有场景（含 404）都在，
 *     各场景不许自己实现页脚，也不许写「要不要显示」的分支。
 *  2. **不加宽外框**：它只占屏幕内 20px 高的一行 + 一条发丝线，
 *     外框仍是 3px 像素边框（用户明确要求）。
 *  3. **窄屏优先丢口号**：段是分开的，`@media` 只隐藏 slogan 段 ——
 *     版权与备案不能被省略号吃掉。
 */
const site = useSiteStore()
</script>

<template>
  <div class="status-bar px px-12" data-testid="status-bar">
    <!-- 左：软按键槽位。P2 接入手柄层后放「菜单 (P)」「音效 ON/OFF」等 -->
    <div class="status-keys">
      <slot name="keys" />
    </div>

    <!-- 右：必要页脚，一行小字 -->
    <p class="status-footer" data-testid="status-footer">
      <template v-for="(segment, index) in site.footerParts" :key="segment.kind">
        <span v-if="index > 0" class="status-dot" aria-hidden="true">·</span>
        <span class="status-seg" :class="`is-${segment.kind}`">{{ segment.text }}</span>
      </template>
    </p>
  </div>
</template>

<style scoped>
.status-bar {
  /* 不伸缩：屏幕内的高度分配给内容区 */
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 20px;
  padding: 2px 8px;

  /* 发丝线让它读起来像「刻在下边框内侧的一行」，而不是第 4 条边框 */
  border-top: var(--border-hair) solid var(--blue-300);
  color: var(--ink-soft);
  overflow: hidden;
}

.status-keys {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.status-footer {
  margin: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-dot {
  color: var(--ink-faint);
}

/* 窄屏优先丢口号：版权与备案是必要信息，口号不是 */
@media (max-width: 900px) {
  .status-seg.is-slogan,
  .status-seg.is-slogan + .status-dot {
    display: none;
  }
}
</style>
