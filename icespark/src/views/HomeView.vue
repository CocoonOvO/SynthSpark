<script setup lang="ts">
import { API_BASE, TOKEN_KEY } from '@/api/client'
import { useSiteStore } from '@/stores/site'

/**
 * 占位首页 —— 真实首页在 P3 按样机重做，这里刻意不做视觉设计。
 * 它现在同时承担三个「顺手能验」的职责：路由通了、契约客户端可用、站点配置读到了。
 */
const site = useSiteStore()

const DONE_ITEMS = [
  'P0 骨架：独立 app、history 路由、转场表现层、契约生成、独立性门与契约漂移门',
  'P1 设计系统：tokens 参数化 + 构建期生成 CSS、像素字体、CRT 质感、配色门',
  'P1 外壳：3px 像素外框 + 底部状态行（页脚刻在下边框内侧）',
  'P1 配置：站点配置三级合并（内置默认 → site.config.json → 后台接口）',
]

const NEXT_ITEMS = [
  'P2 交互内核：手柄层、共享焦点、作用域、对话框、菜单、转场',
  'P3 公开阅读：首页 / 列表 / 详情 / 关于 / 外链 / 404',
  'P4–P6：搜索与档案 / 账号与管理 / 写作',
]
</script>

<template>
  <main>
    <h1>SYNTHSPARK</h1>
    <p>icespark 独立前端 · P0 骨架 + P1 设计系统已就绪（页面仍为占位，P3 起做真页面）</p>

    <h2>已经落地</h2>
    <ul>
      <li v-for="item in DONE_ITEMS" :key="item">{{ item }}</li>
    </ul>

    <h2>后面几轮</h2>
    <ul>
      <li v-for="item in NEXT_ITEMS" :key="item">{{ item }}</li>
    </ul>

    <h2>运行期事实</h2>
    <dl>
      <dt>站点名（来自站点配置）</dt>
      <dd>{{ site.config.site.name }}</dd>
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
