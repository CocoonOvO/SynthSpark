<script setup lang="ts">
import { API_BASE, TOKEN_KEY } from '@/api/client'

/**
 * P0 占位首页 —— 只为证明骨架通了：路由、深链、别名、类型生成、契约客户端。
 * 真正的首页在 P3 按样机的 HomeScene 重做，这里刻意不做任何视觉设计。
 */
const P0_ITEMS = [
  '独立 app：自带 package.json，不引 workspace，零 import 旧前端',
  '路由：vue-router history 模式 + 懒加载分包 + 404 兜底',
  '转场表现层：订阅 router.afterEach，只往外壳写 data-scene',
  '契约：src/api/schema.d.ts 由后端 /api/openapi.json 生成',
  '两道门：check-independence（零外部 import）· check-api-drift（契约漂移）',
]

const NEXT_ITEMS = [
  'P1 设计系统：tokens 构建期生成、像素字体、CRT、M/F/S 分层',
  'P2 交互内核：手柄层、共享焦点、作用域、对话框、菜单',
  'P3 公开阅读：首页 / 列表 / 详情 / 关于 / 外链 / 404',
]
</script>

<template>
  <main>
    <h1>SYNTHSPARK</h1>
    <p>icespark 独立前端 · P0 骨架已就绪（未设计，仅结构）</p>

    <h2>P0 已完成</h2>
    <ul>
      <li v-for="item in P0_ITEMS" :key="item">{{ item }}</li>
    </ul>

    <h2>后面几轮</h2>
    <ul>
      <li v-for="item in NEXT_ITEMS" :key="item">{{ item }}</li>
    </ul>

    <h2>运行时事实</h2>
    <dl>
      <dt>API 前缀</dt>
      <dd>{{ API_BASE }}</dd>
      <dt>令牌存储键</dt>
      <dd>{{ TOKEN_KEY }}</dd>
    </dl>

    <p>
      <RouterLink to="/this-route-does-not-exist">点这里验证 404 兜底</RouterLink>
    </p>
  </main>
</template>
