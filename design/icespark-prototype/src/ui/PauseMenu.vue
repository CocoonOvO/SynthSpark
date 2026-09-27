<script setup lang="ts">
/**
 * 暂停菜单（START / P 呼出）
 *
 * 它一次补上 web 最缺的三件事：全局导航、全局设置入口、输入等价性兜底。
 * 行序按「最常用在上」排列：
 *   继续 / 搜索 / 音效 / 返回上一页 / 转到下一页 / 登录（退出登录）/ 编辑文章 / 设置 / 返回主菜单
 *
 * 与上一版的区别：
 * - 游戏术语清空（不再有 PAUSED / TITLE / RESUME 之类的玩家黑话）
 * - 搜索栏不是摆设：弹内直接检索 /api/search/，结果可点可键盘选
 * - 返回上一页 / 转到下一页 接的是真正的历史栈（见 ui/scene.ts）
 * - 登录与设置是与本菜单同级的独立弹窗，开子弹窗时本菜单不再响应按键（避免一次按键走两层）
 * - 信号强度设置已移除，只在设置弹窗脚注里说明固定为最高档
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onPad, activeScope, type PadAction } from './pad'
import { useFocusGroup } from './focus'
import { playSfx, previewSfx } from './sfx'
import { soundEnabled, setSound } from './prefs'
import {
  resetTo,
  pushScene,
  popScene,
  goForward,
  canGoBack,
  canGoForward,
} from './scene'
import { isLoggedIn, displayName, logout } from './auth'
import { searchPosts, type SearchHit } from '../data/api'
import LoginDialog from './LoginDialog.vue'
import SettingsDialog from './SettingsDialog.vue'

const emit = defineEmits<{ (e: 'close'): void }>()

interface Row {
  id: string
  en: string
  cn: string
  kind: 'action' | 'sound' | 'account'
  disabled?: boolean
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [
    { id: 'resume', en: 'RESUME', cn: '继续', kind: 'action' },
    { id: 'search', en: 'SEARCH', cn: '搜索文章', kind: 'action' },
    { id: 'sound', en: 'SOUND', cn: '音效', kind: 'sound' },
    {
      id: 'back',
      en: 'BACK',
      cn: '返回上一页',
      kind: 'action',
      disabled: !canGoBack.value,
    },
    {
      id: 'forward',
      en: 'FORWARD',
      cn: '转到下一页',
      kind: 'action',
      disabled: !canGoForward.value,
    },
    {
      id: 'account',
      en: 'ACCOUNT',
      cn: isLoggedIn.value ? `退出登录（${displayName.value}）` : '登录',
      kind: 'account',
    },
  ]
  if (isLoggedIn.value) {
    list.push({ id: 'edit', en: 'EDIT', cn: '编辑文章', kind: 'action' })
  }
  list.push({ id: 'settings', en: 'SETTINGS', cn: '设置', kind: 'action' })
  list.push({ id: 'home', en: 'HOME', cn: '返回主菜单', kind: 'action' })
  return list
})

const focus = useFocusGroup()
const hint = ref('')
/** 子弹窗：登录 / 设置。开着的时候本菜单屏蔽按键 */
const sub = ref<'none' | 'login' | 'settings'>('none')
/** 搜索态 */
const mode = ref<'menu' | 'search'>('menu')

const current = computed(() => rows.value[focus.index.value])

/** 调节当前行（←→ 或点分段） */
function adjust(dir: 1 | -1) {
  const row = current.value
  if (!row) return false
  if (row.kind === 'sound') {
    setSound(!soundEnabled.value)
    if (soundEnabled.value) previewSfx('confirm')
    return true
  }
  return false
}

function activate() {
  const row = current.value
  if (!row) return false
  if (row.disabled) {
    hint.value = row.id === 'back' ? '已经在最早的一页了' : '还没有下一页'
    return true
  }
  if (row.kind === 'sound') return adjust(1)

  playSfx('confirm')
  switch (row.id) {
    case 'resume':
      emit('close')
      break
    case 'search':
      openSearch()
      break
    case 'back':
      popScene('wipe')
      emit('close')
      break
    case 'forward':
      goForward('wipe')
      emit('close')
      break
    case 'account':
      if (isLoggedIn.value) {
        logout()
        hint.value = '已退出登录'
      } else {
        hint.value = ''
        sub.value = 'login'
      }
      break
    case 'edit':
      hint.value = '编辑页在下一轮实现，这里只保留入口'
      break
    case 'settings':
      hint.value = ''
      sub.value = 'settings'
      break
    case 'home':
      resetTo('home', 'shake')
      emit('close')
      break
  }
  return true
}

function onAction(a: PadAction): boolean {
  // 子弹窗开着：本菜单完全不响应，避免一次按键走两层
  if (sub.value !== 'none') return false

  if (mode.value === 'search') return onSearchAction(a)

  if (a === 'up') {
    if (!focus.moveBy(-1, rows.value.length)) hint.value = ''
    return true
  }
  if (a === 'down') {
    if (!focus.moveBy(1, rows.value.length)) hint.value = ''
    return true
  }
  if (a === 'left') return adjust(-1) || true
  if (a === 'right') return adjust(1) || true
  if (a === 'confirm') return activate()
  if (a === 'cancel' || a === 'start') {
    emit('close')
    return true
  }
  return false
}

// ── 搜索态 ──

const query = ref('')
const hits = ref<SearchHit[]>([])
const searching = ref(false)
const hitIndex = ref(-1)
const searchInput = ref<HTMLInputElement | null>(null)
let debounce: number | null = null

function openSearch() {
  mode.value = 'search'
  hitIndex.value = -1
  window.setTimeout(() => searchInput.value?.focus(), 0)
}

function closeSearch() {
  mode.value = 'menu'
  hint.value = ''
  searchInput.value?.blur()
}

function onQueryInput() {
  if (debounce) window.clearTimeout(debounce)
  debounce = window.setTimeout(runSearch, 180)
}

async function runSearch() {
  const q = query.value.trim()
  hitIndex.value = -1
  if (!q) {
    hits.value = []
    return
  }
  searching.value = true
  hits.value = await searchPosts(q, 6)
  searching.value = false
}

/** 搜索态按键：焦点在输入框时由输入框自己处理（见模板的 @keydown），这里处理结果列表 */
function onSearchAction(a: PadAction): boolean {
  if (a === 'cancel') {
    if (hitIndex.value >= 0) {
      hitIndex.value = -1
      searchInput.value?.focus()
      return true
    }
    closeSearch()
    return true
  }
  if (a === 'up') {
    if (hits.value.length === 0) return true
    hitIndex.value = Math.max(0, hitIndex.value - 1)
    playSfx('move')
    return true
  }
  if (a === 'down') {
    if (hits.value.length === 0) return true
    hitIndex.value = Math.min(hits.value.length - 1, hitIndex.value + 1)
    playSfx('move')
    return true
  }
  if (a === 'confirm') {
    openHit(hitIndex.value)
    return true
  }
  if (a === 'left' || a === 'right') return true
  return false
}

/** 从输入框按 ↓ 进入结果列表 */
function downToHits() {
  if (hits.value.length === 0) return
  hitIndex.value = 0
  searchInput.value?.blur()
  playSfx('move')
}

function openHit(i: number) {
  const hit = hits.value[i]
  if (!hit) return
  playSfx('confirm')
  // 顺序要紧：先关菜单（否则 pause 作用域还在），再把根页换成文章列表，最后压入详情。
  // resetTo 用 'none' 不产生转场，只有最后一次压栈走闪白，不会两个转场打架。
  emit('close')
  resetTo('posts', 'none')
  pushScene('article', hit.id, 'flash')
}

// 打开期间把输入作用域切到 pause，避免按键穿透到背后的场景
const prevScope = activeScope.value
activeScope.value = 'pause'

const off = onPad(onAction, 'pause')

onUnmounted(() => {
  if (debounce) window.clearTimeout(debounce)
  activeScope.value = prevScope === 'pause' ? 'scene' : prevScope
  off()
})

onMounted(() => {
  hint.value = ''
  // 行数会随登录态变化，收敛一下焦点
  focus.set(Math.min(focus.index.value, rows.value.length - 1), true)
})

/** 鼠标：划过即共享焦点（静音），点击即确认 */
function hoverRow(i: number) {
  focus.hover(i)
}
function clickRow(i: number) {
  focus.set(i, true)
  activate()
}
function clickHit(i: number) {
  hitIndex.value = i
  openHit(i)
}
</script>

<template>
  <div class="pause-mask" data-testid="pause">
    <div class="pause px">
      <div class="pause-head">
        <span class="pause-title">{{ mode === 'menu' ? '菜单' : '搜索' }}</span>
        <span class="pause-sub hint">
          {{ mode === 'menu' ? 'P / ESC 关闭' : 'ESC 返回菜单' }}
        </span>
      </div>

      <!-- ── 菜单态 ── -->
      <template v-if="mode === 'menu'">
        <div class="pause-rows">
          <button
            v-for="(row, i) in rows"
            :key="row.id"
            class="row focusable"
            :data-row="row.id"
            :data-testid="`pause-${row.id}`"
            :class="{ 'is-focused': focus.index.value === i, disabled: row.disabled }"
            @mouseenter="hoverRow(i)"
            @click="clickRow(i)"
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
                @click.stop="((setSound(true)), previewSfx('confirm'))"
              >
                ON
              </b>
            </span>

            <span v-else-if="row.disabled" class="row-arrow off">—</span>
            <span v-else class="row-arrow">▶</span>
          </button>
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
          <div v-else-if="query.trim() && !hits.length" class="hit-empty">
            没有匹配的文章。接口 /api/search/ 不可用时会退化为本地标题匹配。
          </div>
          <div v-else-if="!query.trim()" class="hit-empty hint">
            输入关键词开始检索（ESC 返回菜单）
          </div>

          <button
            v-for="(h, i) in hits"
            :key="h.id"
            class="hit focusable"
            :class="{ 'is-focused': hitIndex === i }"
            :data-testid="`pause-hit-${i}`"
            @mouseenter="hitIndex = i"
            @click="clickHit(i)"
          >
            <span class="hit-title">{{ h.title }}</span>
            <span class="hit-meta hint">
              {{ h.author_name || '匿名' }}
              <template v-if="h.introduction"> · {{ h.introduction.slice(0, 42) }}</template>
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

      <div v-if="hint" class="pause-hint blink" data-testid="pause-hint">{{ hint }}</div>
    </div>

    <!-- 子弹窗：登录 / 设置（与暂停菜单同级的独立弹窗） -->
    <LoginDialog
      v-if="sub === 'login'"
      @close="sub = 'none'"
      @ok="((sub = 'none'), (hint = '登录成功'))"
    />
    <SettingsDialog v-if="sub === 'settings'" @close="sub = 'none'" />
  </div>
</template>

<style scoped>
.pause-mask {
  position: absolute;
  inset: 0;
  z-index: 200;
  background: rgba(18, 58, 82, 0.28);
  display: grid;
  place-items: center;
  padding: 20px;
}

.pause {
  width: min(600px, 100%);
  background: var(--paper);
  border: 3px solid var(--blue-600);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 18px 20px 16px;
}

.pause-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 2px solid var(--blue-300);
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.pause-title {
  font-size: 24px;
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
  border-bottom: 2px solid var(--blue-200);
  padding: 9px 12px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.row.disabled {
  color: var(--ink-faint);
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

.row-arrow.off {
  color: var(--ink-faint);
}

/* 分段控件：音效开关（旧的信号刻度已移除） */
.seg {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.seg-cell {
  font-weight: 400;
  border: 2px solid var(--blue-400);
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
  border: 3px solid var(--blue-400);
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
  border: 2px solid var(--blue-200);
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
  border-top: 2px solid var(--blue-300);
  padding-top: 10px;
}

.btn {
  font: inherit;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--blue-700);
  padding: 6px 12px;
  cursor: pointer;
}

.pause-hint {
  margin-top: 10px;
  color: var(--spark);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
}
</style>
