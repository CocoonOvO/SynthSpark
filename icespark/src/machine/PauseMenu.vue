<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { postKey, searchPosts, type SearchPostHit } from '@/api/search'
import { previewSfx, playSfx } from '@/input/sfx'
import { useFocusGroup } from '@/input/focus'
import { onPad } from '@/input/pad'
import type { PadAction } from '@/input/pad'
import { setScope } from '@/input/scopes'
import { requestTransition } from '@/scene/transition'
import { useAuthStore } from '@/stores/auth'
import { setSound, soundEnabled } from '@/config/prefs'
import SettingsDialog from './SettingsDialog.vue'

/**
 * 暂停菜单（START / P 呼出）—— 照搬样机 `ui/PauseMenu.vue`。
 *
 * 它一次补上 web 最缺的三件事：全局导航、全局设置入口、输入等价性兜底。
 * 行序按「最常用在上」排列：
 *   继续 / 搜索 / 音效 / 登录 / [编辑文章 · 个人信息编辑 · 站点管理] / 设置 / 返回主菜单
 * 方括号那三行只有登录后才出现（超管才多一行站点管理），与样机条件一致。
 *
 * 样机的两处设计照旧保留：
 * - 菜单里**没有**「返回上一页 / 下一页」两行：历史前进后退是全站能力，交给 Q / E
 *   与浏览器按钮（Q/E 在菜单开着时依然有效，见 onAction）
 * - 搜索栏不是摆设：菜单内直接检索 `/api/search/`，结果可点可键盘选
 *
 * 账号行（P3 接上真实登录态后与样机一致）：
 * - 未登录：文案「登录」，回车/点击开登录弹窗（P3 收尾后**不再嵌在菜单里**，见下）；
 * - 已登录：文案「退出登录（昵称）」，回车/点击登出并给一句提示。
 *
 * P3 收尾按用户口径改了两处（2026-09-29）：
 * 1. **点击菜单外 = 取消**：旧行为是只有 ESC / 点「继续」能关。现在点遮罩走 `clickOutside()`，
 *    与 ESC 完全同一条路径（菜单态关菜单、搜索态退回行列表）—— 鼠标与键盘仍然是一套语义。
 * 2. **登录弹窗不再嵌在菜单里**：原来是「菜单里再叠一个登录框」，两层遮罩、两个模态框，
 *    视觉上很难受。现在菜单直接关掉、由外壳开登录框（`App.vue` 持有 `loginOpen`）。
 *    登录成功后外壳把菜单重新打开并带一句 `notice`，用户回到菜单就能看到多出来的三行。
 */
const emit = defineEmits<{ (e: 'close'): void; (e: 'open-login'): void }>()

/**
 * 打开菜单时先显示的一句提示（可选，一次性）。
 *
 * 用途只有一个：登录成功后外壳把菜单重新打开，顺便带一句「登录成功」。
 * 登录弹窗现在是**外壳级模态**（不再嵌在菜单里 —— 用户反馈两框叠在一起不舒服），
 * 所以这句反馈只能由外壳转交进来。
 */
const props = defineProps<{ notice?: string }>()

interface Row {
  id: string
  en: string
  cn: string
  kind: 'action' | 'sound' | 'account' | 'link'
  /** 只有 kind === 'link' 有：正式前端的真实路径 */
  href?: string
}

/**
 * 菜单里的链接行（P5 收口）。
 *
 * 用户裁定「账号和管理每项**分别做成独立页面**」之后，这里不再往 `/profile?tab=…` 里塞 tab，
 * 每行各自一条路由 —— 旧前端那种「一个设置页五个 tab」的口径到此为止：
 *   /write         写作 / 编辑文章（**P6**，还没落地，点了给一句提示）
 *   /profile       个人信息编辑（登录即可）
 *   /admin/site    站点设置（超管）
 *   /admin/links   外链管理（超管）
 *   /admin/audit   审计日志（超管）
 *
 * 机器字样（WRITE / PROFILE / SITE / LINKS / AUDIT）是 8bit 皮肤的一部分，
 * 不进站点配置；中文那列是页面名，也不是站点文案。
 */
const LINK_ROWS: Record<'edit' | 'profile' | 'site' | 'links' | 'audit', Row> = {
  edit: { id: 'edit', en: 'WRITE', cn: '编辑文章', kind: 'link', href: '/write' },
  profile: { id: 'profile', en: 'PROFILE', cn: '个人信息编辑', kind: 'link', href: '/profile' },
  site: { id: 'site', en: 'SITE', cn: '站点设置', kind: 'link', href: '/admin/site' },
  links: { id: 'links', en: 'LINKS', cn: '外链管理', kind: 'link', href: '/admin/links' },
  audit: { id: 'audit', en: 'AUDIT', cn: '审计日志', kind: 'link', href: '/admin/audit' },
}

const router = useRouter()

/** 登录态 / 显示名 / 超管标记都读账号 store（P3 接线；此前这里是一句写死的 false） */
const auth = useAuthStore()

const rows = computed<Row[]>(() => {
  const list: Row[] = [
    { id: 'resume', en: 'RESUME', cn: '继续', kind: 'action' },
    { id: 'search', en: 'SEARCH', cn: '搜索文章', kind: 'action' },
    { id: 'sound', en: 'SOUND', cn: '音效', kind: 'sound' },
    {
      id: 'account',
      en: 'ACCOUNT',
      cn: auth.isLoggedIn ? `退出登录（${auth.displayName}）` : '登录',
      kind: 'account',
    },
  ]

  if (auth.isLoggedIn) {
    list.push(LINK_ROWS.edit, LINK_ROWS.profile)
    // 三张超管页只给超管看（样机口径：非超管干脆看不到行，而不是点进去被拒）
    if (auth.isSuperuser) list.push(LINK_ROWS.site, LINK_ROWS.links, LINK_ROWS.audit)
  }

  list.push({ id: 'settings', en: 'SETTINGS', cn: '设置', kind: 'action' })
  list.push({ id: 'home', en: 'HOME', cn: '返回主菜单', kind: 'action' })
  return list
})

const focus = useFocusGroup()
const hint = ref('')
/** 子弹窗：只剩设置（登录已提到外壳，见文件头第 2 条）。开着的时候本菜单屏蔽按键 */
const sub = ref<'none' | 'settings'>('none')
/** 搜索态 */
const mode = ref<'menu' | 'search'>('menu')

const current = computed(() => rows.value[focus.index.value])

/** 调节当前行（←→ 或点分段）。音效行没有中间档，两个方向都是切换 */
function adjust(): boolean {
  const row = current.value
  if (!row) return false
  if (row.kind === 'sound') {
    setSound(!soundEnabled.value)
    if (soundEnabled.value) previewSfx('confirm')
    return true
  }
  return false
}

/** 菜单里唯一一处「假动作防护」：没有历史时不硬跳，给一句提示 */
function historyAvailable(back: boolean): boolean {
  const state = window.history.state as { back?: unknown; forward?: unknown } | null
  return Boolean(back ? state?.back : state?.forward)
}

function goHistory(back: boolean): void {
  if (!historyAvailable(back)) {
    hint.value = back ? '已经在最早的一页了' : '还没有下一页'
    return
  }
  emit('close')
  if (back) void router.back()
  else void router.forward()
}

function activate(): boolean {
  const row = current.value
  if (!row) return false
  if (row.kind === 'sound') return adjust()

  playSfx('confirm')
  switch (row.id) {
    case 'resume':
      emit('close')
      break
    case 'search':
      openSearch()
      break
    case 'account':
      // 已登录 → 登出并给一句提示；未登录 → 开登录弹窗（照样机：先清提示再开框）
      if (auth.isLoggedIn) {
        auth.logout()
        hint.value = '已退出登录'
      } else {
        // 开登录框前先把自己关掉：外壳会开一个外壳级的登录模态，两个框不叠
        hint.value = ''
        emit('open-login')
        emit('close')
      }
      break
    case 'home':
      emit('close')
      requestTransition('shake')
      void router.push('/')
      break
    case 'profile':
    case 'site':
    case 'links':
    case 'audit':
      // 真页面（P5 起）：关菜单再跳 —— 不关就会变成「菜单压在目标页面上」，
      // 用户看不到自己点到了哪儿
      emit('close')
      void router.push(row.href ?? '/')
      break
    case 'edit':
      // `/write` 是 P6 的活：行照样机留着（登录后就有），点了先说清楚它还不在
      hint.value = `写作页还没做（P6），目标路径 ${row.href}`
      break
    case 'settings':
      hint.value = ''
      sub.value = 'settings'
      break
  }
  return true
}

function onAction(action: PadAction): boolean {
  // 子弹窗开着：本菜单完全不响应，避免一次按键走两层
  if (sub.value !== 'none') return false

  if (mode.value === 'search') return onSearchAction(action)

  if (action === 'up') {
    if (!focus.moveBy(-1, rows.value.length)) hint.value = ''
    return true
  }
  if (action === 'down') {
    if (!focus.moveBy(1, rows.value.length)) hint.value = ''
    return true
  }
  if (action === 'left' || action === 'right') return adjust() || true
  if (action === 'confirm') return activate()
  // Q / E 的全局含义是浏览器历史，菜单开着也不该失效
  if (action === 'back' || action === 'forward') {
    goHistory(action === 'back')
    return true
  }
  if (action === 'cancel' || action === 'start') {
    emit('close')
    return true
  }
  return false
}

// ── 搜索态 ──

const query = ref('')
const hits = ref<SearchPostHit[]>([])
const searching = ref(false)
const searchFailed = ref(false)
const hitIndex = ref(-1)
const searchInput = ref<HTMLInputElement | null>(null)
let debounce = 0

function openSearch(): void {
  mode.value = 'search'
  hitIndex.value = -1
  window.setTimeout(() => searchInput.value?.focus(), 0)
}

function closeSearch(): void {
  mode.value = 'menu'
  hint.value = ''
  searchInput.value?.blur()
}

function onQueryInput(): void {
  window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void runSearch(), 180)
}

async function runSearch(): Promise<void> {
  const keyword = query.value.trim()
  hitIndex.value = -1
  searchFailed.value = false
  if (!keyword) {
    hits.value = []
    return
  }

  searching.value = true
  try {
    hits.value = await searchPosts(keyword, 6)
  } catch {
    // 生产版没有本地样张可退 —— 就诚实说一句检索失败（样机那句「退化为本地匹配」在这里是假的）
    hits.value = []
    searchFailed.value = true
  }
  searching.value = false
}

/** 搜索态按键：焦点在输入框时由输入框自己处理（见模板的 @keydown），这里处理结果列表 */
function onSearchAction(action: PadAction): boolean {
  if (action === 'cancel') {
    if (hitIndex.value >= 0) {
      hitIndex.value = -1
      searchInput.value?.focus()
      return true
    }
    closeSearch()
    return true
  }
  if (action === 'up') {
    if (hits.value.length === 0) return true
    hitIndex.value = Math.max(0, hitIndex.value - 1)
    playSfx('move')
    return true
  }
  if (action === 'down') {
    if (hits.value.length === 0) return true
    hitIndex.value = Math.min(hits.value.length - 1, hitIndex.value + 1)
    playSfx('move')
    return true
  }
  if (action === 'confirm') {
    openHit(hitIndex.value)
    return true
  }
  if (action === 'left' || action === 'right') return true
  return false
}

/** 从输入框按 ↓ 进入结果列表 */
function downToHits(): void {
  if (hits.value.length === 0) return
  hitIndex.value = 0
  searchInput.value?.blur()
  playSfx('move')
}

function openHit(i: number): void {
  const hit = hits.value[i]
  if (!hit) return
  playSfx('confirm')
  // 顺序要紧：先关菜单（否则 pause 作用域还在），再跳文章
  emit('close')
  requestTransition('flash')
  // 地址栏要可读：能拿到 slug 就用 slug。文章详情页在 P3 落地，现在会落到 404 兜底页
  void router.push(`/post/${encodeURIComponent(postKey({ id: hit.id, slug: hit.slug }))}`)
}

/** 打开期间把输入作用域切到 pause，避免按键穿透到背后的场景 */
const releaseScope = setScope('pause')
const off = onPad(onAction, 'pause')

onMounted(() => {
  hint.value = props.notice ?? ''
  // 行数会随登录态变化，收敛一下焦点
  focus.set(Math.min(focus.index.value, rows.value.length - 1), true)
})

/**
 * 鼠标点击菜单外 = 鼠标版的 ESC。
 * 菜单态：关掉菜单；搜索态：与 ESC 一样先取消选中、再退回行列表（不直接关菜单，
 * 否则鼠标用户点一下空白就把整个菜单丢了，和键盘行为对不上）。
 */
function clickOutside(): void {
  if (sub.value !== 'none') return
  if (mode.value === 'search') onSearchAction('cancel')
  else emit('close')
}

onUnmounted(() => {
  window.clearTimeout(debounce)
  off()
  releaseScope()
})

/** 鼠标：划过即共享焦点（静音），点击即确认 */
function hoverRow(i: number): void {
  focus.hover(i)
}

function clickRow(i: number): void {
  focus.set(i, true)
  activate()
}

function clickHit(i: number): void {
  hitIndex.value = i
  openHit(i)
}
</script>

<template>
  <div
    class="pause-mask"
    data-testid="pause"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pause-title"
    @click.self="clickOutside"
  >
    <div class="pause px">
      <div class="pause-head">
        <span id="pause-title" class="pause-title">{{ mode === 'menu' ? '菜单' : '搜索' }}</span>
        <span class="pause-sub hint">
          {{ mode === 'menu' ? 'P / ESC 关闭' : 'ESC 返回菜单' }}
        </span>
      </div>

      <!-- ── 菜单态 ── -->
      <template v-if="mode === 'menu'">
        <div class="pause-rows">
          <!-- 链接行渲染成真 <a>（可复制、可中键新开），其余行是 button -->
          <component
            :is="row.href ? 'a' : 'button'"
            v-for="(row, i) in rows"
            :key="row.id"
            class="row focusable"
            :data-row="row.id"
            :data-testid="`pause-${row.id}`"
            :href="row.href"
            :class="{ 'is-focused': focus.index.value === i }"
            @mouseenter="hoverRow(i)"
            @click.prevent="clickRow(i)"
          >
            <span class="row-en">{{ row.en }}</span>
            <span class="row-cn">{{ row.cn }}</span>

            <!-- 音效行：ON/OFF 分段，鼠标可直接点 -->
            <span v-if="row.kind === 'sound'" class="seg" @click.stop>
              <b
                class="seg-cell"
                :class="{ on: !soundEnabled }"
                data-seg="off"
                @click.stop="setSound(false)"
              >
                OFF
              </b>
              <b
                class="seg-cell"
                :class="{ on: soundEnabled }"
                data-seg="on"
                @click.stop="
                  () => {
                    setSound(true)
                    previewSfx('confirm')
                  }
                "
              >
                ON
              </b>
            </span>

            <span v-else class="row-arrow">{{ row.href ? '↗' : '▶' }}</span>
          </component>
        </div>
      </template>

      <!-- ── 搜索态 ── -->
      <template v-else>
        <label class="search-field">
          <span class="search-cap">关键词</span>
          <input
            ref="searchInput"
            v-model="query"
            class="input"
            data-testid="pause-search-input"
            type="text"
            spellcheck="false"
            placeholder="输入标题或正文片段，回车检索"
            @input="onQueryInput"
            @keydown.down.prevent="downToHits"
            @keydown.enter.prevent="runSearch"
          />
        </label>

        <div class="hits" data-testid="pause-search-hits">
          <div v-if="searching" class="hit-empty blink">▌ 检索中 …</div>
          <div v-else-if="searchFailed" class="hit-empty">检索失败：后端接口不可用，稍后再试。</div>
          <div v-else-if="query.trim() && !hits.length" class="hit-empty">没有匹配的文章。</div>
          <div v-else-if="!query.trim()" class="hit-empty hint">
            输入关键词开始检索（ESC 返回菜单）
          </div>

          <button
            v-for="(hit, i) in hits"
            :key="hit.id"
            class="hit focusable"
            :class="{ 'is-focused': hitIndex === i }"
            :data-testid="`pause-hit-${i}`"
            @mouseenter="hitIndex = i"
            @click="clickHit(i)"
          >
            <span class="hit-title">{{ hit.title }}</span>
            <span class="hit-meta hint">
              {{ hit.author_name || '匿名' }}
              <template v-if="hit.introduction"> · {{ hit.introduction.slice(0, 42) }}</template>
            </span>
          </button>
        </div>

        <div class="search-foot">
          <button class="btn focusable mini" data-testid="pause-search-back" @click="closeSearch()">
            ◀ 返回菜单
          </button>
          <span class="hint">↓ 进入结果 · ↑↓ 选择 · ENTER 打开</span>
        </div>
      </template>

      <!-- 提示行**不闪**（用户反馈：一整句红字反复明灭太晃眼）。
           样机这里挂的是 `blink`，闪的是「▌ 检索中 …」那种光标字形 —— 一个方块闪才像光标，
           一整句话闪就是干扰。这一处是**有意偏离样机**，理由见架构 §26.2；
           仍然保留 `--spark` 红与位置，反馈一点没少，只是不再明灭。 -->
      <div v-if="hint" class="pause-hint" data-testid="pause-hint">{{ hint }}</div>
    </div>

    <!-- 子弹窗：只剩设置。登录框是外壳级模态（App.vue），不在这里叠 -->
    <SettingsDialog v-if="sub === 'settings'" @close="sub = 'none'" />
  </div>
</template>

<style scoped>
.pause-mask {
  position: absolute;
  inset: 0;
  z-index: 200;
  background: var(--veil-soft);
  display: grid;
  place-items: center;
  padding: 20px;
}

.pause {
  width: min(600px, 100%);
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-600);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 18px 20px 16px;
}

.pause-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: var(--border-thin) solid var(--blue-300);
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.pause-title {
  font-size: var(--px-md);
  color: var(--blue-600);
}

.pause-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  border-bottom: var(--border-thin) solid var(--blue-200);
  padding: 9px 12px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  /* 链接行是真 <a>，去掉浏览器默认下划线（颜色已被上面的 color 覆盖） */
  text-decoration: none;
}

.row-en {
  min-width: 96px;
  color: var(--blue-600);
}

.row.is-focused .row-en {
  color: var(--blue-700);
}

.row-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 14px;
  font-weight: 700;
}

.row-arrow {
  margin-left: auto;
  color: var(--blue-500);
}

/* 分段控件：音效开关（旧的信号刻度已移除） */
.seg {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.seg-cell {
  font-weight: 400;
  border: var(--border-thin) solid var(--blue-400);
  background: var(--paper);
  color: var(--ink-soft);
  padding: 1px 8px;
  cursor: pointer;
  min-width: 34px;
  text-align: center;
}

.seg-cell.on {
  background: var(--blue-500);
  border-color: var(--blue-600);
  color: var(--paper);
}

/* ── 搜索态 ── */
.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-cap {
  flex: 0 0 auto;
  color: var(--ink-soft);
}

.input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  padding: 7px 8px;
}

.input:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.hits {
  margin: 12px 0;
  min-height: 120px;
  max-height: 44vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  font: inherit;
  background: var(--paper);
  border: var(--border-thin) solid var(--blue-200);
  padding: 8px 10px;
  cursor: pointer;
}

.hit-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 14px;
  font-weight: 700;
}

.hit-meta {
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hit-empty {
  padding: 10px 2px;
  color: var(--ink-soft);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.8;
}

.search-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: var(--border-thin) solid var(--blue-300);
  padding-top: 10px;
}

.btn {
  font: inherit;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  color: var(--blue-700);
  padding: 6px 12px;
  cursor: pointer;
}

.pause-hint {
  margin-top: 10px;
  color: var(--spark);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
  /* 不挂 `.blink`：这里是一整句提示，反复明灭会晃眼睛（架构 §26.2）。
     于是这条规则与样机的差别只有「没有动画」，字号 / 颜色 / 位置一个字没动 */
}
</style>
