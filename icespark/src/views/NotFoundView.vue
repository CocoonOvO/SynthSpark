<script setup lang="ts">
/**
 * ERROR 场景：404 兜底页
 *
 * 内容与结构来自**旧前端**那一版（`frontend/src/views/error/NotFoundView.vue`，460 行）：
 * 故障扫描线 5 条（依次延迟）· 漂浮粒子 20 个（随机位置 / 延迟 / 时长）·
 * 大号 `404` + 「页面未找到」+ 那句「迷失在数字深渊中」· 终端提示三行 + 闪烁光标 ·
 * 「返回首页」按钮 · 底部链接组（文章列表 / 个人中心 / 返回上一页）。
 *
 * 但要按 icespark 的皮肤规则重写（架构 §16.5 迁移硬规则 + §13 硬要求 1/5）：
 *   · 颜色只走 `src/styles/tokens.ts` 的 CSS 变量，本文件的 scoped 样式里**零色值字面量**
 *     （配色漂移门会扫样式表）；旧版的 `linear-gradient` / 圆角 / 投影 / `ease-in-out`
 *     全部换成 8bit 手法：硬边、抖动网点、`steps()` 离散动画。
 *   · 机器字样（`404` / `$` / `find /pages` / `Error: File not found`）走像素字体（`.px`），
 *     给用户读的中文句子走可读黑体（写法照 `AboutView.vue` 的 `.fact-v`）。
 *
 * 与旧前端的四处**有理由的偏差**（完整偏差表见交付报告）：
 *   1. **回显原始地址**：终端第一行写成 `$ find /pages -name "<原始 path>"`。
 *      旧前端没有回显，但 `e2e/skeleton.spec.ts` 的「深链未知路径」用例钉着
 *      「404 页要回显原地址」（`main` 里必须含 `/no/such/path`），这是生产版的需要。
 *   2. **不搬左上角品牌位**：旧前端在页面左上角再放了一份 logo + 站点名。
 *      icespark 的品牌与外框由外壳负责（标签栏 / 底栏 `.deck`），屏幕内再放一个 logo
 *      是同一份事实的第二处渲染，所以不搬。
 *   3. **补机器铭牌**：场景头（时钟 + `错误 · ERROR`）是 icespark 每个场景的固定件
 *      （旧前端没有），不加就与全站其它页面不是一套骨架。
 *   4. **补一行操作提示**：旧前端没写按键说明；这属于 8bit 皮肤（不是站点文案），
 *      与首页 / 关于页同一套说法。
 *
 * 页面自己**不实现**页脚 / 小字 / 状态行：站点小字恒在 `.deck`，由外壳渲染（404 页也常驻）。
 *
 * 目录里各条硬要求的落点：
 *   · 根节点是 `<div>` 不是 `<main>` —— 地标由外壳 `.screen-inner` 提供（两个 main 会被 axe 拦）。
 *   · 键盘一律走 `onPad()`（作用域固定 `scene`，外壳 `mountInput` 是全站唯一的键盘监听器，
 *     页面里**绝不**自己 `window.addEventListener('keydown')`），卸载时释放。
 *   · 页内自出一个 `<h1>`（外壳对 `error` 场景不发隐藏 h1），标题层级不跳级。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useFocusGroup } from '@/input/focus'
import { focusShellRoot } from '@/input'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'

const route = useRoute()
const router = useRouter()
const { clock, stop } = useStatusBar()

/**
 * 终端里回显的原始地址。
 * 用 `fullPath` 而不是 `path`：查询参数也是「你敲进去的那个地址」的一部分。
 * e2e 断言的是 `/no/such/path` 这个纯路径，两种写法都命中；带 query 时这条更忠实。
 */
const targetPath = route.fullPath

onMounted(scrollScreenTop)
onUnmounted(stop)

/* ╭────────────────────────────────────────────────────────────╮
   │  漂浮粒子：旧版 20 个，位置 / 延迟 / 时长都是随机的
   ╰────────────────────────────────────────────────────────────╯ */
interface Particle {
  left: number
  delay: number
  duration: number
}

const particles = ref<Particle[]>([])

onMounted(() => {
  // 与旧版同一份随机口径：left 0–100%、delay 0–8s、duration 6–10s
  particles.value = Array.from({ length: 20 }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 6 + Math.random() * 4,
  }))
})

/* ╭────────────────────────────────────────────────────────────╮
   │  焦点：页内可交互项共用一份焦点（键盘与鼠标等价）
   ╰────────────────────────────────────────────────────────────╯ */

/**
 * 页内可交互项，顺序 = 视觉顺序：
 * 0 返回首页 · 1 文章列表 · 2 个人中心 · 3 返回上一页。
 *
 * 用 `useFocusGroup()` 而不是像旧前端那样只靠浏览器原生焦点：
 * icespark 的焦点是全站**自绘**的一套（`.focusable.is-focused` 浅蓝底 + 两侧闪烁方块），
 * 键盘方向键必须能在页内移动；Tab 在这类无标签栏的页面上依然还给浏览器（`App.vue` 的
 * `tabNext` 分支只消费有标签栏的场景），两条路径互不打架。
 */
const items = [0, 1, 2, 3] as const
const focus = useFocusGroup({ initial: 0 })

function isAt(i: number): boolean {
  return focus.index.value === i
}

/** 键盘 / 鼠标共用的「移动焦点」（鼠标路径静音，走 `hover`） */
function focusTo(i: number, silent = false): void {
  focus.set(i, silent)
}

/**
 * 页内可交互项，顺序 = 视觉顺序。
 * `to` 就是旧前端三个 `router-link` 的落点，逐字照搬：
 * ・`/` 与 `/posts` 是标签页（路由名同名），走 `@/scene/nav` 的 `goTab()` 带转场。
 * ・`/profile` 是旧前端的「个人中心」。**这一页 P5 才做** —— 保留这个链接是刻意的
 *   （旧前端结构不删项），代价是从这里点进去会再落回本页，见交付报告里的偏差记录。
 *   `/profile` 现在没有对应路由，所以只能按路径 push（`goTab` 走的是路由名）。
 */
const LINKS = [
  { key: 'home', to: '/', label: '返回首页' },
  { key: 'posts', to: '/posts', label: '文章列表' },
  { key: 'profile', to: '/profile', label: '个人中心' },
  { key: 'back', to: '', label: '返回上一页' },
] as const

function goBackPrev(): void {
  playSfx('confirm')
  // 旧前端就是无条件 back()；这里不加守卫，保持行为一致
  window.history.back()
}

function activate(i: number): void {
  const link = LINKS[i]
  if (!link || link.key === 'back') {
    goBackPrev()
    return
  }
  playSfx('confirm')
  if (link.key === 'home' || link.key === 'posts') {
    void goTab(link.key, 'wipe')
    return
  }
  // 个人中心：目标页还没做，按路径 push（落到 404 兜底就是这个链接现在的诚实行为）
  void router.push(link.to)
}

/**
 * 原生焦点（Tab 走出来的链接、外壳软键）与自绘焦点（`.is-focused`）共存的两条规矩。
 * 与文章页同源（`PostDetailView.vue` 的 `nativeFocusInside` / `dropNativeFocus`），
 * 差别只在判据：那一页问「焦点在不在本文档内」，这里问「这个元素本来就会响应回车吗」——
 * 因为本页四个目标都是真 `<a href>`，而外壳软键是真 `<button>`，两种情况都该由浏览器接。
 *
 * 1. 原生焦点落在会响应回车的元素上时，回车**交给浏览器**：Tab 到页内链接、或 Tab 到
 *    外壳软键，都由原生激活接住这一下。不这么做，软键会被本页的 `confirm` 抢掉
 *    （实测：Tab 到「音效」软键按回车，键被吞、软键不响应）。
 * 2. 我们自己的焦点一动（方向键 / 鼠标划过），就把原生焦点收掉，屏幕上永远只有一个光标。
 */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  // 收回外壳根节点，**不是** `blur()` 到 body：焦点掉到 body 之后键盘事件不再冒泡到
  // 外壳的监听器，整块键盘会失灵（实测见 `src/input/index.ts` 的注释）
  focusShellRoot()
}

const off = onPad((a) => {
  // 四项是一条竖线（主按钮 + 链接行），键盘按「顺序」在它们之间走：
  // ↑/← 后退一项、↓/→ 前进一项 —— 旧前端没有键盘模型，这里套的是 icespark 的焦点约定。
  // 走到两端就交还按键（不消费），标签栏 / 浏览器滚动还能接住 ↑ 与 ↓。
  // 回车：浏览器手里有焦点就让它去激活（规矩 1）
  if (a === 'confirm' && nativeOwnsEnter()) return false
  // 方向键一动，先把原生焦点收掉（规矩 2）
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') dropNativeFocus()

  if (a === 'up' || a === 'left') {
    if (!focus.moveBy(-1, items.length)) return false
    return true
  }
  if (a === 'down' || a === 'right') {
    if (!focus.moveBy(1, items.length)) return false
    return true
  }
  if (a === 'confirm') {
    activate(focus.index.value)
    return true
  }
  // 这里**不消费** ESC：全站口径是「P / ESC 打开暂停菜单」（首页 / 关于页的操作提示、
  // 文章页的键位条都这么写），404 不该是唯一的例外 —— 键盘用户也不会卡死：
  // 上一页有 Q（外壳的全局后退键，`App.vue` 的 `back`），页内还有四个可聚焦目标。
  return false
})
onUnmounted(off)
</script>

<template>
  <div class="not-found">
    <!-- 屏幕级扫描线（机器质感，鼠标不可达、屏幕阅读器忽略） -->

    <!-- 故障扫描线：旧版 5 条，依次延迟 0.6s -->
    <div class="glitch-bg" aria-hidden="true">
      <div
        v-for="n in 5"
        :key="n"
        class="glitch-line"
        :style="{ animationDelay: `${n * 0.6}s` }"
      ></div>
    </div>

    <!-- 漂浮粒子：旧版 20 个，位置 / 延迟 / 时长随机 -->
    <div class="particles" aria-hidden="true">
      <div
        v-for="(p, n) in particles"
        :key="`particle-${n}`"
        class="particle"
        :style="{
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
        }"
      ></div>
    </div>

    <!-- 机器铭牌：时钟 + 场景名。旧前端没有这一块 —— 按 icespark 全站统一的场景头补上 -->
    <SceneHead title="错误 · ERROR" :clock="clock">
      <span class="hint">这个地址没有对应的页面</span>
    </SceneHead>

    <div class="error-container">
      <!-- 404：页内唯一的 h1（外壳对 error 场景不发隐藏 h1），标题层级不跳级 -->
      <h1 class="error-code px px-72 px-display">
        <!-- 三个图层叠同一个 404：底色在上层保证可读，两个伪元素层出蓝 / 品红刃边。
             内层必须自己带 `px-72`：`.px *` 会把所有后代的字号锁成 12px，只靠继承拿不到大字号 -->
        <span class="code-main px-72 px-display" aria-hidden="true">404</span>
        <span class="sr-only">404 页面未找到</span>
      </h1>

      <h2 class="error-message">页面未找到</h2>
      <p class="error-description read">你寻找的页面似乎已经迷失在数字深渊中，或者它从未存在过。</p>

      <!-- 终端提示：机器字样走像素字体；旧版三行 + 闪烁光标。
           第一行按生产版需要补上原始地址回显（旧前端是 `-name "target"` 写死的） -->
      <div class="terminal-hint px">
        <div class="terminal-line">
          <span class="terminal-prompt">$</span>
          <span>find /pages -name "{{ targetPath }}"</span>
        </div>
        <div class="terminal-line">
          <span class="terminal-prompt">&gt;</span>
          <span class="terminal-error">Error: File not found</span>
        </div>
        <div class="terminal-line">
          <span class="terminal-prompt">$</span>
          <span>cd ~<span class="terminal-cursor blink"></span></span>
        </div>
      </div>

      <!-- 返回首页：主按钮。真实 `<a>`，Tab 能到、回车原生激活、鼠标直接点 -->
      <a
        class="back-home-btn focusable"
        :class="{ 'is-focused': isAt(0) }"
        :href="LINKS[0].to"
        @mouseenter="focusTo(0, true)"
        @click.prevent="activate(0)"
      >
        <span class="btn-mark" aria-hidden="true">◄</span>
        {{ LINKS[0].label }}
      </a>

      <!-- 底部链接组：旧前端三项（文章列表 / 个人中心 / 返回上一页）。
           三项都挂 `.focusable`：它们参与页内焦点模型，焦点视觉走全站唯一那一套 -->
      <div class="footer-links">
        <a
          class="footer-link focusable"
          :class="{ 'is-focused': isAt(1) }"
          :href="LINKS[1].to"
          @mouseenter="focusTo(1, true)"
          @click.prevent="activate(1)"
          >{{ LINKS[1].label }}</a
        >
        <a
          class="footer-link focusable"
          :class="{ 'is-focused': isAt(2) }"
          :href="LINKS[2].to"
          @mouseenter="focusTo(2, true)"
          @click.prevent="activate(2)"
          >{{ LINKS[2].label }}</a
        >
        <!-- 旧前端是 `<a href="#">` + `@click.prevent`：这是动词不是链接，保留同一结构 -->
        <a
          class="footer-link focusable"
          :class="{ 'is-focused': isAt(3) }"
          href="#"
          @mouseenter="focusTo(3, true)"
          @click.prevent="goBackPrev()"
          >{{ LINKS[3].label }}</a
        >
      </div>

      <!-- 操作提示：机器字样，与其它页面同一套说法 -->
      <div class="foot-hint sticky-foot px hint">
        ↑↓←→ 移动 · ENTER 确认 · Q 返回 · ESC 菜单 · TAB 到软键
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ╭────────────────────────────────────────────────────────────╮
   │  404：页面迷失在数字深渊中
   │  色值一律走 tokens.ts 的 CSS 变量，这里一个色值字面量都不许有
   ╰────────────────────────────────────────────────────────────╯ */
.not-found {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  padding: 18px 26px 0;
}

/* 这里**不要**再铺一层扫描线：外壳的 `.screen.crt::before`（`styles/crt.css`）
   对每个场景常驻同一份 1px/3px 细纹，页面里再画一遍就是叠两遍、比其他页更脏。
   旧前端 404 也没有屏幕级细纹，只有下面那 5 条移动亮条。 */

/* ╭── 背景故障效果 ──╮ */
.glitch-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* 旧版是一条 `transparent → accent → transparent` 的渐变亮条。
   8bit 换成「硬边亮条 + 抖动网点」：没有过渡，边界是硬的 */
.glitch-line {
  position: absolute;
  top: -10%;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--blue-400);
  background-image: radial-gradient(var(--blue-600) 1px, transparent 1px);
  background-size: 4px 4px;
  opacity: 0;
  animation: glitch-scan 3s steps(8, end) infinite;
}

@keyframes glitch-scan {
  0% {
    top: -10%;
    opacity: 0;
  }
  10% {
    opacity: 0.3;
  }
  90% {
    opacity: 0.3;
  }
  100% {
    top: 110%;
    opacity: 0;
  }
}

/* ╭── 粒子效果 ──╮ */
.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* 旧版是 4px 圆点吃 `ease-in-out` 平滑漂浮；这里保持 4px 硬方块，动画改走 steps() */
.particle {
  position: absolute;
  bottom: 0;
  width: 4px;
  height: 4px;
  background: var(--blue-500);
  opacity: 0;
  animation: glitch-float 8s steps(12, end) infinite;
}

@keyframes glitch-float {
  0%,
  100% {
    transform: translateY(100vh) translateX(0);
    opacity: 0;
  }
  10% {
    opacity: 0.6;
  }
  90% {
    opacity: 0.4;
  }
  100% {
    transform: translateY(-100vh) translateX(50px);
    opacity: 0;
  }
}

/* ╭── 内容区域 ──╮ */
.error-container {
  position: relative;
  z-index: 1;
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 0 32px;
}

/* 404 机读版：只给屏幕阅读器（视觉上是下面那三个图层） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ── 404 数字：故障刃边 ──
   旧版用 `::before/::after` 各叠一份彩色 404 做「色散」。
   这里保留同一套结构，只把颜色换成 token、给偏移加上 `steps()` 离散节奏。

   字号走模板上的 `px-72 px-display`（与首页 hero / 列表日号同一套写法）。
   为什么内层 `.code-main` 也要带 `px-72`：`pixel.css` 的 `.px *` 会把**所有后代**的字号
   锁回 12px，只靠继承拿不到大字号，实测底字会缩成 12px 而伪元素层还是 72px。

   窄屏档位写在下面的 `@media` 里、并带 `!important` —— `.px-72` 就是 `!important`，
   同特异性下 media 规则按源序也赢不过它，少了 `!important` 窄屏字号不生效（实测仍是 72px） */
.error-code {
  position: relative;
  display: inline-block;
  margin: 0;
  color: var(--ink);
  animation: glitch-text 2s steps(4, end) infinite;
}

.error-code::before,
.error-code::after {
  content: '404';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  z-index: -1;
}

/* 上带：蓝 */
.error-code::before {
  color: var(--blue-500);
  clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
  animation: glitch-layer-1 1.2s steps(2, end) infinite alternate;
}

/* 下带：品红强调色（克制使用，只在故障刃边） */
.error-code::after {
  color: var(--spark);
  clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
  animation: glitch-layer-2 1.2s steps(2, end) infinite alternate;
}

.code-main {
  display: inline-block;
}

@keyframes glitch-text {
  0%,
  90%,
  100% {
    transform: translate(0);
  }
  92% {
    transform: translate(-2px, 2px);
  }
  94% {
    transform: translate(2px, -2px);
  }
  96% {
    transform: translate(-2px, -2px);
  }
  98% {
    transform: translate(2px, 2px);
  }
}

@keyframes glitch-layer-1 {
  0% {
    transform: translate(0);
  }
  50% {
    transform: translate(-3px, 3px);
  }
  100% {
    transform: translate(0);
  }
}

@keyframes glitch-layer-2 {
  0% {
    transform: translate(0);
  }
  50% {
    transform: translate(3px, -3px);
  }
  100% {
    transform: translate(0);
  }
}

/* ── 错误信息 ── */
.error-message {
  margin: 24px 0 12px;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
}

/* 中文明文走可读黑体（像素字体只承担机器字样），写法照 AboutView 的 .fact-v */
.error-description {
  max-width: 34em;
  margin: 0 0 40px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 15px;
  color: var(--ink-soft);
}

/* ── 终端提示 ──
   旧版是圆角 + 细描边 + 半透明底。8bit 换成硬边方块 + 四角打点（不靠圆角 / 投影） */
.terminal-hint {
  position: relative;
  width: min(100%, 480px);
  margin: 0 auto 32px;
  padding: 20px 24px;
  border: var(--border-frame) solid var(--blue-400);
  background: var(--blue-100);
  text-align: left;
  font-size: var(--px-sm);
}

/* 四角打点：两个 3px 硬方块写在 ::before 上，用 `background-size: 100% 100%`
   把「左上 + 右下」拉满整个盒子（两个 100% 的 radial 各出一角），
   `background-repeat: no-repeat` 保证不会平铺出第二对 */
.terminal-hint::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(var(--blue-600) 1px, transparent 1px),
    radial-gradient(var(--blue-600) 1px, transparent 1px);
  background-size: 100% 100%;
  background-position:
    0 0,
    100% 100%;
  background-repeat: no-repeat;
}

.terminal-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.terminal-line:last-child {
  margin-bottom: 0;
}

.terminal-prompt {
  flex: 0 0 auto;
  color: var(--blue-600);
}

/* 错误行走深蓝（`--spark` 是亮品红，白底上对比度不够，不能拿来当文字色） */
.terminal-error {
  color: var(--blue-700);
}

/* 闪烁光标：用全局 `.blink` 原语（pixel.css 已经处理去动效 / reduced-motion，
   本文件不再自己写一份 @keyframes blink） */
.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  margin-left: 2px;
  vertical-align: middle;
  background: var(--blue-600);
}

/* ── 返回首页（主按钮）──
   旧版是 `linear-gradient(135deg, ...)` + 圆角 + 投影 —— 三样都是铁律禁止的。
   换成实色块 + 8bit 立体边（内侧 1px 亮边，不是外投影），
   悬停 / 聚焦都只换实色（不做位移、不做发光）。

   **为什么选择器要多一层 `.not-found`**（别删，架构 §17.2 第 16 条那个坑的同型问题）：
   `.focusable:is(.is-focused, :focus-visible)` 的特异性是 (0,2,0)，与 `.back-home-btn[data-v]`
   打平 —— 平局按源序，而本视图是懒加载，视图 CSS 永远排在 `pixel.css` 之后的那一批里，
   实测焦点蓝底（`--blue-200`）会把主按钮的实色整个压掉。提到 (0,3,0) 后，
   按钮的实色在「空闲 / 悬停 / 聚焦」三种状态下都稳定生效，浅蓝也行不通成主按钮的底色。 */
.not-found .back-home-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  border: var(--border-frame) solid var(--edge);
  /* 实色底用 --blue-600：白字对比度 4.67（AA 正文线），--blue-500 只有 3.09 */
  background: var(--blue-600);
  box-shadow: inset 1px 1px 0 0 var(--paper);
  color: var(--paper);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.not-found .back-home-btn:hover {
  background: var(--blue-700);
  color: var(--paper);
}

/* 聚焦：蓝底反白（全站唯一一套焦点视觉只在 ::before/::after 画两个闪烁方块，
   底色由元素自己决定 —— 主按钮要保住「主」，就换成反白，不借浅蓝背景） */
.not-found .back-home-btn:focus-visible {
  background: var(--blue-700);
  color: var(--paper);
}

.btn-mark {
  font-size: var(--px-sm);
}

/* ── 底部链接组 ──
   三项都挂 `.focusable` —— 它们参与键盘方向键的焦点模型，所以焦点视觉必须走全站那一套。
   代价是焦点蓝底与 `.footer-link[data-v]` 打平后被压掉（同主按钮那条注释），
   于是这里统一用 `.not-found` 前缀把特异性提到 (0,3,0)，也顺手替掉默认下划线（靠颜色表达） */
.footer-links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 40px;
}

.not-found .footer-link {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 14px;
  /* 默认就走 --blue-700：白底对比度 7.49；--ink-soft 只有 3.65，14px 正文不过 AA */
  color: var(--blue-700);
  text-decoration: none;
  cursor: pointer;
}

.not-found .footer-link:hover {
  color: var(--blue-700);
  text-decoration: underline;
}

.foot-hint {
  margin-top: auto;
  padding-top: 18px;
}

/* ── 响应式 ── */
@media (max-width: 768px) {
  /* 404 字号必须带 `!important`：`.px-72` 本身就是 `!important` 档位锁（pixel.css），
     这里不带就只有「同为 !important 时按源序」这条路，实测压不过它。
     旧版窄屏 120px，对应这里的 `--px-xl`（48px）这一档 */
  .error-code,
  .error-code .code-main {
    font-size: var(--px-xl) !important;
  }

  .error-message {
    font-size: 20px;
  }

  .terminal-hint {
    padding: 16px;
  }

  .back-home-btn {
    padding: 12px 24px;
  }

  .footer-links {
    gap: 16px;
  }
}

/* 动效开关（设置 → 动效，`.app[data-motion='off']`）与系统偏好：
   与 pixel.css 同一套口径 —— 关掉动画后功能一个不少。
   `.blink`（光标）由全局规则处理，这里只管本文件自己的三个 @keyframes */
.app[data-motion='off'] .glitch-line,
.app[data-motion='off'] .particle,
.app[data-motion='off'] .error-code,
.app[data-motion='off'] .error-code::before,
.app[data-motion='off'] .error-code::after {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .glitch-line,
  .particle,
  .error-code,
  .error-code::before,
  .error-code::after {
    animation: none !important;
  }
}
</style>
