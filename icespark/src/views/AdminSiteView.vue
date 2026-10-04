<script setup lang="ts">
/**
 * ADMIN-SITE 场景：站点设置（P5，路由 `/admin/site`，超管页）
 *
 * 旧前端里这是 `ProfileView.vue` 的「站点设置」tab（超管专属，`authStore.isAdmin` 那一块），
 * P5 用户裁定**独立成页**（架构 §23.2）。字段口径、中文标签与「保存后刷新才生效」这句
 * 原话都对齐旧前端那一版，页面壳（SceneHead / 四态 / 键位提示 / 像素语言）对齐 P4 的
 * `UserProfileView.vue`。
 *
 * ── 这一页最容易做错的地方，逐条写在这里 ──
 *
 * 1. **写回去的是「整份 dict」，不是补丁**（§23.2）。所以编辑态必须**原样留着**读回来的
 *    每一个键：`server` 存原文（diff 的基准），`texts` 存每一段的 JSON 文本（编辑的真相），
 *    保存时按段拼出完整 body。任何「只把表单里认识的字段拼一份出来」的写法都会静默丢掉
 *    别的段 —— 契约里站点配置是 `additionalProperties: true` 的自由结构，后端多给
 *    `site.defaultTheme`、管理员自己加的 `custom` 段，都得原样带回去。
 *
 * 2. **不是一个裸 JSON 大框**（任务口径）。页面按「段」编辑：左列是段列表（契约的五个
 *    已知段在前，配置里多出来的段照样列出来），右边是当前段的编辑面板 ——
 *    段内**顶层字符串字段**给带中文标签的输入框（`站点名称` / `版权文字`…），
 *    数组与嵌套对象不拆成几十个格子，走这一段的 JSON 原文（`textarea`），
 *    两者共用**同一份** `texts`，没有第二份草稿会不同步。
 *
 * 3. **非法 JSON 给人话**。后端收到坏 body 只会回一句 422，对「末项多了一个逗号」
 *    毫无指引，所以校验与提示都放在本地：按行列出错位置 + 常见原因的猜测，
 *    并且**拦住保存**（按钮禁用），不让管理员把坏 body 发出去换一句 422 回来。
 *
 * 4. **能看出差异**。每一段都与读回来的原文做叶子级对照（对象递归、数组当整块），
 *    段列表上标「● N」、面板里列 `- 旧值 / + 新值`。保存成功后原文换成刚写回去的那一份，
 *    差异归零 —— 但「刷新页面后生效」的提示照旧给（配置在页面打开时读一次）。
 *
 * 5. **超管判定在页内**（§23.1）：未登录由路由守卫送回主页，这里**不重复**写；
 *    「登录了但不是超管」时页内渲染「仅超管可见」，并且**不去读配置**（假令牌打真接口
 *    只会拿 403，读它没有任何意义）。权限是缓存里读的、可能后来才由 `/api/auth/me`
 *    翻过来，所以 `isSuperuser` 变真时补一次读取。
 *
 * 6. **配色只走 CSS 变量**：scoped 样式里零色值字面量、零渐变、零圆角、零投影；
 *    唯一的花纹是现成的 `.dither-25`（网点语言长在全局 pixel.css 里，页面不自己复刻）。
 *
 * 7. **键盘**：`useFocusGroup()` + `onPad`，方向键在「返回 → 段列表 → 保存 → 重新读取」
 *    这条链上走、ENTER 确认、`Q` 返回上一页（深链接没有上一页就回主页，键盘用户不会卡死）；
 *    `ESC` **不消费**，交给全局菜单。字段用原生焦点：Tab 在字段间走，
 *    方向键 / 鼠标 hover 一动就 `focusShellRoot()` 收掉原生焦点（**不用 `blur()`**，
 *    焦点掉到 body 后键盘事件不再冒到外壳，整块键盘会失灵）。
 *
 * 8. **`h1` 自己出**（`admin-site` 已在 `App.vue` 的 `SELF_TITLED_SCENES` 里）：
 *    页头「站点设置」是全页唯一的一级标题，各分节是 `h2`，不跳级。
 *
 * 9. **长文本编辑**（用户反馈：窄格子里写长文本不方便）。这一页的框宽度按版面定，
 *    「站点描述」「关于页正文」这类**文档型**字段（`kind === 'area'`，即带换行或超过 80 字）
 *    在框内右上角有个展开图标，按 F2 也一样 —— 打开 `machine/TextEditorDialog.vue`。
 *    单行的字段（名称 / 标题 / 版权这种一行字）**不接**：用户口径是「只有文档形式的文本框需要」。
 *    弹窗**只换画布**：保存仍旧写回同一份 `texts`，数据流一个字没变 ——
 *    字段走 `setField`、JSON 走 `setJsonText`，都是下面原来那两个 @input 处理器现用的路径。
 *    打开期间按 `pageModalOpen` + 本页 `onPad` 的守卫把按键留在框里（见 `longTextPad`）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { fetchAdminSiteConfig, saveAdminSiteConfig } from '@/api/admin'
import { ApiError } from '@/api/client'
import { focusShellRoot } from '@/input'
import { useFocusGroup } from '@/input/focus'
import { onPad, type PadAction } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import ExpandGlyph from '@/machine/ExpandGlyph.vue'
import SceneHead from '@/machine/SceneHead.vue'
import TextEditorDialog from '@/machine/TextEditorDialog.vue'
import { useStatusBar } from '@/scene/clock'
import { useLongText } from '@/scene/longtext'
import { canGoBack, goBack, goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { clock, stop } = useStatusBar()

// ── 段的展示口径 ──

/** 契约里的五个已知段（顺序即页面上的顺序，架构 §23.2） */
const KNOWN_SEGMENTS = ['site', 'navbar', 'footer', 'home', 'about'] as const
type KnownSegment = (typeof KNOWN_SEGMENTS)[number]

/** 段名 → 中文名（管理员该一眼找到「页脚」，不必先认 english key） */
const SEGMENT_LABELS: Record<string, string> = {
  site: '站点信息',
  navbar: '导航栏',
  footer: '页脚',
  home: '首页文案',
  about: '关于页文案',
}

/**
 * 字段名 → 中文名，键写成 `段.字段`。
 * 为什么带段前缀：`badge` / `title` 在 home 与 about 两段里都有，不带前缀就串了。
 * 这里包含 `site.defaultTheme`（架构 §23.2 列了它，`config/types.ts` 刻意没进类型）——
 * 页面不按类型表渲染字段，后端给什么键就照什么键渲染，所以它在页面上照样能改。
 */
const FIELD_LABELS: Record<string, string> = {
  'site.name': '站点名称',
  'site.title': '浏览器标题',
  'site.description': '站点描述',
  'site.icp': '备案号',
  'site.defaultTheme': '默认主题',
  'site.logo': '站点 Logo',
  'navbar.logo': 'Logo 文字',
  'navbar.navItems': '导航项',
  'footer.copyright': '版权文字',
  'footer.slogan': '口号',
  'footer.links': '链接组',
  'home.badge': '角标',
  'home.title': '横幅标题',
  'home.desc': '横幅描述',
  'home.primaryBtn': '主按钮文字',
  'home.secondaryBtn': '次按钮文字',
  'home.stats': '统计标签',
  'home.articles': '最新文章段',
  'home.groups': '分组段',
  'home.tags': '标签段',
  'home.allCard': '全部文章卡',
  'about.badge': '角标',
  'about.title': '标题',
  'about.desc': '描述',
  'about.facts': '要点块',
  'about.body': '正文（markdown）',
  'about.techStack': '技术栈',
}

/** 长到这个份上的字符串不塞进单行输入框（正文 markdown 会变成一条横向滚动条） */
const LONG_TEXT = 80

// ── 状态 ──

/**
 * 四态（§23.3 硬要求 3）：`loading` 读取中 · `ready` 有配置可改 ·
 * `empty` 后端从没保存过（契约原文：返回 `{}`） · `error` 读取失败。
 * 保存失败**不进** `error`：那是「读不到」，此时页面里的配置还在、改的东西也不该被扔掉。
 */
type LoadState = 'loading' | 'ready' | 'empty' | 'error'
const state = ref<LoadState>('loading')
const loadError = ref('')
const saveError = ref('')
const savedFlash = ref(false)
const saving = ref(false)

/** 读回来的原文：diff 的基准。与编辑中的文本分开存，才能一直回答「我改了什么」 */
const server = ref<Record<string, unknown>>({})
/** 段顺序：存在的已知段（按契约顺序）在前，配置里多出来的段原样跟在后头 */
const segments = ref<string[]>([])
/** 每段的 JSON 文本 —— 编辑中的**唯一**真相来源（可能是暂时非法的文本） */
const texts = ref<Record<string, string>>({})
const activeKey = ref('')
/** 新增段的输入框（不是每段都能对上契约，所以允许自定义段名） */
const newKey = ref('')
const addError = ref('')

/** 只读一次的守卫：`load()` 自己也会置真（错误态里的「重试」按钮直接调 `load()`） */
let requested = false

// ── 纯函数小工具 ──

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON 深拷贝：值本来就来自 JSON（读回来的配置 / 待写回去的 body），round-trip 保真 */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 序列化一段：2 空格缩进，人能读、diff 的行也好对 */
function stringifySegment(value: unknown): string {
  const text = JSON.stringify(value, null, 2)
  return typeof text === 'string' ? text : 'null'
}

/** 字符下标 → 行号（报错定位用，两个都是 1 起数） */
function lineOf(text: string, position: number): number {
  return text.slice(0, Math.max(0, position)).split('\n').length
}

/** 字符下标 → 列号 */
function columnOf(text: string, position: number): number {
  const head = text.slice(0, Math.max(0, position))
  return Math.max(0, position) - head.lastIndexOf('\n')
}

function textOf(key: string): string {
  return texts.value[key] ?? ''
}

interface SegmentParse {
  ok: boolean
  value?: unknown
  /** 非法时的人话提示（空串表示这一段没问题） */
  error: string
}

/**
 * 把 `JSON.parse` 的英文报错翻成「照着改就能好」的一句话。
 *
 * 为什么值得单写一段：后端收到坏 body 只会回 422/校验错误，那对「末项多了个逗号」
 * 这种问题毫无指引 —— 提示必须在本地就给到人话，而且要说清**哪一行**。
 */
function describeJsonError(text: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  // V8 的两种形状：`... in JSON at position 42 (line 3 column 15)` 与只有 position 的旧写法；
  // 还有一类报错（单引号那种）连位置都不给，那就没有行号可指。
  const lineColumn = /\(line (\d+) column (\d+)\)/.exec(message)
  const matched = /position (\d+)/.exec(message)?.[1]
  const position = matched === undefined ? Number.NaN : Number(matched)
  const at = lineColumn
    ? `第 ${lineColumn[1]} 行第 ${lineColumn[2]} 列附近：`
    : Number.isFinite(position)
      ? `第 ${lineOf(text, position)} 行第 ${columnOf(text, position)} 列附近：`
      : ''

  let hint = '这不是合法的 JSON。'
  if (/,\s*[}\]]/.test(text)) {
    // 光看文本就能认出来：末项后面多了一个逗号（最常见的粘贴事故）
    hint = '多了一个逗号 —— JSON 的最后一项后面不能有逗号。'
  } else if (text.includes("'")) {
    hint = '字符串只能用双引号 —— JSON 不认单引号。'
  } else if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(text)) {
    hint = '键名也要用双引号包起来，例如 "name": "值"。'
  } else if (/Unexpected end of JSON input|Unterminated/i.test(message)) {
    hint = '括号或引号没有闭合。'
  } else if (/Expected double-quoted property name/i.test(message)) {
    hint = '这里等着一个双引号包起来的键名 —— 常见原因是上一项末尾多了逗号，或键名没加引号。'
  } else if (/Expected ',' or/i.test(message)) {
    hint = '这里少了一个逗号（相邻两项之间必须有）。'
  } else if (/Expected property name or/i.test(message)) {
    hint = '键名要用双引号包起来，例如 "name": "值"。'
  } else if (/Unexpected token/i.test(message)) {
    hint = '有一个多出来的字符，或者少了逗号。'
  }

  return `${at}${hint}（浏览器原文：${message}）`
}

/** 解析一段的 JSON 文本 */
function parseSegment(text: string): SegmentParse {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { ok: false, error: '这一段是空的：至少写一个 JSON 值，例如 {} 或 []。' }
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown, error: '' }
  } catch (err) {
    return { ok: false, error: describeJsonError(trimmed, err) }
  }
}

/** 段内顶层字段（给输入框用的三种形态） */
interface FieldRow {
  key: string
  label: string
  kind: 'text' | 'area' | 'struct'
  /** 字符串字段的文本；`struct` 形态给的是摘要 */
  text: string
}

/** 结构化值的摘要：数组 / 对象只报形状，具体内容去这一段的 JSON 里改 */
function summaryOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length} 项] → 在这一段的 JSON 里改`
  if (isPlainObject(value)) return `{${Object.keys(value).length} 个键} → 在这一段的 JSON 里改`
  const text = JSON.stringify(value)
  return `${typeof text === 'string' ? text : 'null'} → 在这一段的 JSON 里改`
}

/** 段值 → 字段行；不是普通对象就不给字段（整段走 JSON） */
function fieldRows(segment: string, value: unknown): FieldRow[] {
  if (!isPlainObject(value)) return []
  const rows: FieldRow[] = []
  for (const [key, item] of Object.entries(value)) {
    const label = FIELD_LABELS[`${segment}.${key}`] ?? key
    if (typeof item === 'string') {
      const long = item.includes('\n') || item.length > LONG_TEXT
      rows.push({ key, label, kind: long ? 'area' : 'text', text: item })
    } else {
      rows.push({ key, label, kind: 'struct', text: summaryOf(item) })
    }
  }
  return rows
}

// ── 编辑态 ──

/**
 * 用一份完整配置重建编辑态（读回来 / 空态起骨架 / 保存成功后都走这里）。
 *
 * `keepActive` 给保存成功那条路用：刚保存完就把光标踢回第一段，正在改 footer 的人
 * 会当场失去上下文。段被删掉时（配置里没有它了）照样回落到第一段。
 */
function hydrate(raw: Record<string, unknown>, keepActive = false): void {
  const previous = activeKey.value
  server.value = cloneJson(raw)

  const keys = Object.keys(raw)
  const known = KNOWN_SEGMENTS.filter((key) => keys.includes(key))
  const rest = keys.filter((key) => !KNOWN_SEGMENTS.includes(key as KnownSegment))
  segments.value = [...known, ...rest]

  const next: Record<string, string> = {}
  for (const key of segments.value) next[key] = stringifySegment(raw[key])
  texts.value = next

  activeKey.value =
    keepActive && segments.value.includes(previous) ? previous : (segments.value[0] ?? '')
  segFocus.set(Math.max(0, segments.value.indexOf(activeKey.value)), true)
}

/** 逐段解析结果（每次文本变动重算；段都很小，够快） */
const parsed = computed<Record<string, SegmentParse>>(() => {
  const map: Record<string, SegmentParse> = {}
  for (const key of segments.value) map[key] = parseSegment(textOf(key))
  return map
})

/** 还没写合法的段：只要有它，保存就该被拦住 */
const invalidKeys = computed(() => segments.value.filter((key) => parsed.value[key]?.ok !== true))

const activeOk = computed(() => parsed.value[activeKey.value]?.ok === true)
const activeError = computed(() => parsed.value[activeKey.value]?.error ?? '')
const activeFields = computed<FieldRow[]>(() => {
  const current = parsed.value[activeKey.value]
  if (!current?.ok) return []
  return fieldRows(activeKey.value, current.value)
})

// ── 差异对照 ──

interface DiffLine {
  path: string
  kind: 'changed' | 'added' | 'removed'
  before: string
  after: string
}

function shortValue(value: unknown): string {
  const text = JSON.stringify(value)
  const one = typeof text === 'string' ? text : 'null'
  return one.length > 120 ? `${one.slice(0, 120)}…` : one
}

/**
 * 把一段摊平成「叶子路径 → 一行文本」，路径带段名（`site.name` / `navbar.navItems`）。
 * 对象递归下去（带段名的完整路径才一眼知道该去改哪儿），**数组当整块**：
 * 导航项逐项展开只会刷屏，而「整个 navItems 换掉了」本来也就是一次改动。
 */
function leaves(value: unknown, prefix: string, out: Map<string, string>): void {
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    for (const [key, item] of Object.entries(value)) {
      leaves(item, prefix ? `${prefix}.${key}` : key, out)
    }
    return
  }
  out.set(prefix, shortValue(value))
}

/** 一段的改动行（非法 JSON 时比不了，返回空） */
function diffOf(key: string): DiffLine[] {
  const draft = parsed.value[key]
  if (!draft?.ok) return []
  const before = new Map<string, string>()
  const after = new Map<string, string>()
  leaves(server.value[key], key, before)
  leaves(draft.value, key, after)

  const lines: DiffLine[] = []
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path)
    const b = after.get(path)
    if (a === b) continue
    if (a === undefined) lines.push({ path, kind: 'added', before: '', after: b ?? '' })
    else if (b === undefined) lines.push({ path, kind: 'removed', before: a, after: '' })
    else lines.push({ path, kind: 'changed', before: a, after: b })
  }
  return lines
}

const diffs = computed<Record<string, DiffLine[]>>(() => {
  const map: Record<string, DiffLine[]> = {}
  for (const key of segments.value) map[key] = diffOf(key)
  return map
})

const activeDiff = computed<DiffLine[]>(() => diffs.value[activeKey.value] ?? [])
const totalChanges = computed(() =>
  segments.value.reduce((sum, key) => sum + (diffs.value[key]?.length ?? 0), 0),
)

/** 段列表右侧那个改动标记（比「有没有改过」更细：改了几处） */
function changedMark(key: string): string {
  const count = diffs.value[key]?.length ?? 0
  return count > 0 ? `● ${count}` : '—'
}

function segmentLabel(key: string): string {
  return SEGMENT_LABELS[key] ?? '自定义段'
}

/** 字段输入框的 id（显式 `<label for>`，不给 axe 的 label 规则留口子） */
function fieldId(key: string): string {
  return `admin-site-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// ── 读取 ──

async function load(): Promise<void> {
  requested = true
  state.value = 'loading'
  loadError.value = ''
  saveError.value = ''
  savedFlash.value = false

  try {
    const config = await fetchAdminSiteConfig()
    // 后端从没保存过时返回 {} —— 这不是错误，是「后台这一层还是空的」
    if (!isPlainObject(config) || Object.keys(config).length === 0) {
      server.value = {}
      segments.value = []
      texts.value = {}
      activeKey.value = ''
      state.value = 'empty'
      return
    }
    hydrate(config)
    state.value = 'ready'
  } catch (err) {
    // 失败把后端的 detail **原文**摆出来（ApiError 的 message 就是它），不吞、不改写
    loadError.value = err instanceof ApiError ? err.message : `读取失败：${String(err)}`
    state.value = 'error'
  }
}

function ensureLoad(): void {
  if (requested) return
  void load()
}

/**
 * 空态那一步：按契约的五个已知段起一份空骨架。
 * 每段是空对象，三级合并时等于「这一段没写」—— 只为了给管理员一个下手的地方，
 * 不会把任何实际配置伪造出来。
 */
function startSkeleton(): void {
  const raw: Record<string, unknown> = {}
  for (const key of KNOWN_SEGMENTS) raw[key] = {}
  hydrate(raw)
  state.value = 'ready'
  playSfx('confirm')
}

// ── 段与字段的编辑 ──

/** 打开某一段（段列表上的 ENTER / 点击；光标移动本身不换段，和全站的芯片口径一致） */
function openSegment(index: number): void {
  const key = segments.value[index]
  if (!key) return
  activeKey.value = key
  savedFlash.value = false
  playSfx('confirm')
}

function toggleTo(index: number): void {
  hoverSegment(index)
  openSegment(index)
}

/**
 * 把某一格的字符串写回**这一段的 JSON 文本**，整段重新序列化。
 * 没有第二份草稿 —— 输入框、长文本弹窗与下面的 JSON 永远是同一份数据的三种看法。
 * `seg` 默认是当前段；长文本弹窗传的是**打开弹窗那一刻**记下的那一段（见 `onLongSave`）。
 */
function setField(key: string, value: string, seg: string = activeKey.value): void {
  const current = parsed.value[seg]
  if (!current?.ok || !isPlainObject(current.value)) return
  const next: Record<string, unknown> = { ...current.value, [key]: value }
  texts.value = { ...texts.value, [seg]: stringifySegment(next) }
  savedFlash.value = false
}

function setJsonText(value: string, seg: string = activeKey.value): void {
  texts.value = { ...texts.value, [seg]: value }
  savedFlash.value = false
}

/** 格子上的 @input 只是把原生控件的值递给 `setField` */
function onField(key: string, event: Event): void {
  setField(key, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function onJson(event: Event): void {
  setJsonText((event.target as HTMLTextAreaElement).value)
}

/* ══════════════ 长文本编辑（文档型文本框才配） ══════════════ */

/**
 * 打开弹窗那一刻「正在改哪儿」。
 * 段名与字段名都**记下来**而不是保存时现读 `activeKey` —— 弹窗开着的时候段不可能被换掉
 * （遮罩盖住了整页），但记下来后这段逻辑与「弹窗开着时页面状态会不会变」无关，更耐改。
 * `field === null` 表示改的是这一段的整段 JSON。
 */
const longSeg = ref('')
const longField = ref<string | null>(null)

const { editing, openLongText, closeLongText } = useLongText()

/** 只有 `area` 这一种（文档型）才开弹窗；单行字段连图标都不加 */
function openFieldLong(row: FieldRow): void {
  if (row.kind !== 'area') return
  longSeg.value = activeKey.value
  longField.value = row.key
  playSfx('confirm')
  openLongText({
    key: row.key,
    label: row.label,
    value: row.text,
    focusId: fieldId(row.key),
  })
}

function openJsonLong(): void {
  longSeg.value = activeKey.value
  longField.value = null
  playSfx('confirm')
  openLongText({
    key: activeKey.value,
    label: `${activeKey.value} · JSON`,
    value: textOf(activeKey.value),
    mono: true,
    focusId: 'admin-site-json',
  })
}

/** F2 = 编辑这一格的全文（内核 `KEYMAP` 里没有 F2，不会被外壳吃掉） */
function onFieldKey(event: KeyboardEvent, row: FieldRow): void {
  if (event.key !== 'F2') return
  event.preventDefault()
  openFieldLong(row)
}

function onJsonKey(event: KeyboardEvent): void {
  if (event.key !== 'F2') return
  event.preventDefault()
  openJsonLong()
}

/** 弹窗保存：写回打开那一刻记下的那一段/那一格（先取上下文再关，`closeLongText()` 会清空 `editing`） */
function onLongSave(value: string): void {
  const seg = longSeg.value
  const field = longField.value
  closeLongText()
  if (!seg) return
  if (field === null) setJsonText(value, seg)
  else setField(field, value, seg)
}

/**
 * 长文本弹窗开着时的按键归属（写法与 `AdminLinksView` 的 `dialogPad` 同源）。
 *
 * `cancel` 在**这里**关框，而不是只靠弹窗自己的 DOM 监听：点过遮罩之后外壳会把原生焦点
 * 收回根节点，那时弹窗内的监听器根本收不到按键，只剩这一条路。
 * 其余按键一律吞掉 —— 下面的方向键分支会把原生焦点收回外壳，焦点一离开弹窗，
 * 框里的键盘当场就死了（§21 记的那条链条）。
 * Tab 例外：焦点还在编辑区里时内核本来就让浏览器自己走，这里放行不会多一次触发。
 */
function longTextPad(a: PadAction): boolean {
  if (a === 'cancel') {
    closeLongText()
    return true
  }
  if (a === 'tabNext' || a === 'tabPrev') return false
  return true
}

/**
 * 「还原这一段」的双胞胎：配置里本来就有这一段 → 还原成原文；
 * 是这次新加的段 → 干脆删掉（留一个 `null` 段比删掉更让人困惑）。
 */
function restoreSegment(): void {
  const key = activeKey.value
  if (!key) return

  if (Object.prototype.hasOwnProperty.call(server.value, key)) {
    texts.value = { ...texts.value, [key]: stringifySegment(server.value[key]) }
  } else {
    segments.value = segments.value.filter((item) => item !== key)
    const next = { ...texts.value }
    delete next[key]
    texts.value = next
    activeKey.value = segments.value[0] ?? ''
    segFocus.set(0, true)
  }
  savedFlash.value = false
  playSfx('confirm')
}

function isNewSegment(): boolean {
  return (
    activeKey.value !== '' && !Object.prototype.hasOwnProperty.call(server.value, activeKey.value)
  )
}

function addSegment(): void {
  const key = newKey.value.trim()
  if (key === '') {
    addError.value = '段名不能是空的。'
    return
  }
  if (segments.value.includes(key)) {
    addError.value = `已经有「${key}」这一段了。`
    return
  }
  segments.value = [...segments.value, key]
  texts.value = { ...texts.value, [key]: '{}' }
  activeKey.value = key
  addError.value = ''
  newKey.value = ''
  savedFlash.value = false
  segFocus.set(segments.value.length - 1, true)
  playSfx('confirm')
}

// ── 保存 ──

/** 按段拼出完整 body（段顺序与配置里一致；能走到这里说明没有非法段） */
function buildPayload(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of segments.value) {
    const current = parsed.value[key]
    if (current?.ok) out[key] = current.value
  }
  return out
}

async function save(): Promise<void> {
  if (saving.value) return

  if (invalidKeys.value.length > 0) {
    // 不发这个请求：后端只会回一句 422，把人话留在这里说
    saveError.value = `有 ${invalidKeys.value.length} 段的 JSON 还没写合法，照提示改好再保存。`
    return
  }

  saving.value = true
  saveError.value = ''
  savedFlash.value = false

  try {
    const payload = buildPayload()
    await saveAdminSiteConfig(payload)
    // 写回去了：原文换成这一份，差异归零；但配置是启动时读一次，页面上的旧值要刷新才换
    hydrate(payload, true)
    state.value = 'ready'
    savedFlash.value = true
    playSfx('confirm')
  } catch (err) {
    // 失败保持可编辑：后端 detail 原文照摆，改好的东西一个都不许扔
    saveError.value = err instanceof ApiError ? err.message : `保存失败：${String(err)}`
  } finally {
    saving.value = false
  }
}

// ── 焦点与键盘 ──

/**
 * 光标链：`back`（返回）→ `list`（段列表）→ `save`（保存）→ `reload`（重新读取）。
 * 段列表内部用 `useFocusGroup`（同一份共享焦点，鼠标 hover 静音移动同一个 index）。
 * 「还原这一段 / 添加段 / 重试」这几个次要按钮不进这条链：它们按 DOM 顺序由 Tab 走到、
 * 回车交还浏览器原生激活（`nativeOwnsEnter()`），键盘用户一样够得到。
 */
type Zone = 'back' | 'list' | 'save' | 'reload'
const zone = ref<Zone>('list')
const segFocus = useFocusGroup({ initial: 0 })

function isCursor(index: number): boolean {
  return zone.value === 'list' && segFocus.index.value === index
}

function isActiveSegment(index: number): boolean {
  return activeKey.value === segments.value[index]
}

function hoverSegment(index: number): void {
  // 鼠标一动就收掉 Tab 走出来的原生焦点：屏幕上永远只有一个光标（与文章页同一惯例）
  dropNativeFocus()
  zone.value = 'list'
  segFocus.hover(index)
}

function hoverZone(next: Zone): void {
  dropNativeFocus()
  zone.value = next
}

/**
 * 原生焦点（Tab 走出来的按钮 / 输入框）与自绘焦点共存的两条规矩，照文章页与用户档案页：
 *
 * 1. 原生焦点在会响应回车的元素上时，回车**还给浏览器**（否则一次回车被处理两遍）。
 *    输入框 / 文本域里的按键本来就不进手柄层（`isEditableTarget`），这一条管的是 Tab 到按钮。
 * 2. 我们自己的焦点一动（方向键 / 鼠标 hover），就把原生焦点收回外壳根节点 ——
 *    **不是** `blur()` 到 body：焦点掉到 body 之后键盘事件不再冒泡到外壳，整块键盘会失灵。
 */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  focusShellRoot()
}

/** 返回上一页；深链接进来没有上一页就回主页（键盘用户不会卡死在管理页） */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/** 链上走一格 */
function step(dir: -1 | 1): boolean {
  const count = segments.value.length

  if (zone.value === 'back') {
    if (dir === -1) return false
    zone.value = count > 0 ? 'list' : 'save'
    playSfx('move')
    return true
  }

  if (zone.value === 'list') {
    if (dir === -1 && (count === 0 || segFocus.index.value === 0)) {
      zone.value = 'back'
      playSfx('move')
      return true
    }
    if (dir === 1 && segFocus.index.value >= count - 1) {
      zone.value = 'save'
      playSfx('move')
      return true
    }
    const next = Math.max(0, Math.min(count - 1, segFocus.index.value + dir))
    segFocus.set(next)
    return true
  }

  if (zone.value === 'save') {
    if (dir === -1) {
      zone.value = count > 0 ? 'list' : 'back'
      if (count > 0) segFocus.set(count - 1)
      playSfx('move')
      return true
    }
    zone.value = 'reload'
    playSfx('move')
    return true
  }

  // reload：链尾，再往下把按键还给浏览器
  if (dir === -1) {
    zone.value = 'save'
    playSfx('move')
    return true
  }
  return false
}

const off = onPad((action) => {
  // 长文本弹窗开着时，页面层把按键交给它先处理。
  // 守卫必须写在**自己**这个监听器里：外壳的 `runPass` 会遍历全部同作用域监听器、不提前退出，
  // 少这一句，弹窗里按方向键会被下面的分支把焦点收回外壳，框里的键盘当场失灵。
  if (editing.value) return longTextPad(action)

  // Q：全站的历史后退键。页面显式接管，只为了补上「深链接没有上一页」的兜底
  if (action === 'back') {
    back()
    return true
  }

  if (action === 'confirm') {
    // 规矩 1：原生焦点在按钮 / 输入框上时，这一下回车归浏览器
    if (nativeOwnsEnter()) return false
    if (zone.value === 'back') {
      back()
      return true
    }
    if (zone.value === 'save') {
      void save()
      return true
    }
    if (zone.value === 'reload') {
      playSfx('confirm')
      void load()
      return true
    }
    openSegment(segFocus.index.value)
    return true
  }

  if (action === 'up' || action === 'down') {
    // 规矩 2：方向键一动就收掉原生焦点
    dropNativeFocus()
    return step(action === 'up' ? -1 : 1)
  }

  // 左右没有相邻项：还给浏览器（原生光标移动 / 横向滚动照旧）
  if (action === 'left' || action === 'right') return false

  // ESC 不消费：全站口径是「P / ESC 打开暂停菜单」，这里不做唯一的例外
  return false
})

onUnmounted(() => {
  off()
  stop()
})

onMounted(() => {
  scrollScreenTop()
  // 非超管压根不该读这个接口（假令牌打真接口只会拿 403）
  if (auth.isSuperuser) ensureLoad()
})

/** 权限是缓存里读的，可能随后被 `/api/auth/me` 翻成真 —— 一到就把配置读起来 */
watch(
  () => auth.isSuperuser,
  (isSuperuser) => {
    if (isSuperuser) ensureLoad()
  },
)
</script>

<template>
  <div class="admin-site">
    <SceneHead title="站点设置 · SITE" :clock="clock">
      <span class="head-tag px">仅超管</span>
      <!-- 返回：鼠标能点，键盘 Q（同一个 back()）。Tab 在无标签栏页面还给浏览器，
           所以这个真实 <button> 也能被 Tab 走到、回车原生激活 -->
      <button
        class="back focusable mini"
        data-testid="admin-site-back"
        :class="{ 'is-focused': zone === 'back' }"
        @mouseenter="hoverZone('back')"
        @click="back"
      >
        ◀ 返回 (Q)
      </button>
    </SceneHead>

    <!-- 页头：全页唯一的一级标题，四个状态里都在（不会出现没有一级标题的页面） -->
    <header class="lead">
      <h1 class="lead-title px px-36 px-display">站点设置</h1>
      <p class="lead-desc read">
        这是三级站点配置里<b>优先级最高</b>的「后台」那一层：内置默认 &lt; 本地 site.config.json
        &lt; 后台配置。保存时把「整份」配置写回去，没动过的段也原样带上。
      </p>
      <p class="lead-meta px hint">
        读 GET /api/admin/site-config · 写 PUT（完整 dict，不是补丁）· 配置在页面打开时读一次
      </p>
      <!-- 装饰：抖动网点条（网点语言在全局 pixel.css 里，页面不自己复刻），屏幕阅读器忽略 -->
      <div class="lead-dither dither-25" aria-hidden="true"></div>
    </header>

    <!-- 非超管：页内提示，不重定向（§23.1；未登录那一条由路由守卫负责，这里不重复） -->
    <section v-if="!auth.isSuperuser" class="state" data-testid="admin-site-superuser-only">
      <h2 class="state-title">仅超管可见</h2>
      <p class="state-hint hint">
        站点设置改的是全站文案与导航，只有超管账号能看能改。你现在已经登录了，但这个账号的
        <code>is_superuser</code> 不是真值。
      </p>
      <p class="state-hint hint">找管理员要权限，或换一个超管账号再来。</p>
    </section>

    <!-- 状态一：读取中 -->
    <div v-else-if="state === 'loading'" class="state px" data-testid="admin-site-loading">
      <span class="blink">▌</span> 读取后台站点配置 …
    </div>

    <!-- 状态二：读取失败 —— 把后端 detail 原文摆出来，重试按钮留在原地 -->
    <section v-else-if="state === 'error'" class="state" data-testid="admin-site-error">
      <h2 class="state-title">站点配置读取失败</h2>
      <p class="err" data-testid="admin-site-load-error">{{ loadError }}</p>
      <p class="state-hint hint">
        上面这句是后端返回的 <code>detail</code> 原文。读不到就不写回，改不到配置也不会写坏它。
      </p>
      <button class="btn focusable mini" data-testid="admin-site-retry" @click="load">
        重试 (R)
      </button>
    </section>

    <!-- 状态三：后端从没保存过（契约原文：GET 返回 {}）—— 不是错误，是一条明确的下手路径 -->
    <section v-else-if="state === 'empty'" class="state" data-testid="admin-site-empty">
      <h2 class="state-title">后台从没保存过站点配置</h2>
      <p class="state-hint hint">
        接口返回的是空对象 <code>{}</code>，三级合并会继续用本地 site.config.json 与内置默认，
        所以站点现在是正常的 —— 只是「后台」这一层还没有内容。
      </p>
      <button class="btn focusable mini" data-testid="admin-site-skeleton" @click="startSkeleton">
        以五个已知段起骨架
      </button>
      <p class="state-hint hint">
        起骨架只是在编辑区摆出 site / navbar / footer / home / about，空对象不覆盖任何东西。
      </p>
    </section>

    <!-- 状态四：有配置可改 -->
    <div v-else class="work" data-testid="admin-site-ready">
      <div class="cols">
        <!-- 左列：段列表。契约的五个已知段在前，配置里多出来的段原样列出来 -->
        <section class="seg-col">
          <h2 class="col-title">配置段（{{ segments.length }}）</h2>
          <div class="seg-list">
            <div
              v-for="(key, i) in segments"
              :key="key"
              class="seg focusable"
              data-testid="admin-site-segment"
              :data-segment="key"
              :class="{ 'is-focused': isCursor(i), 'is-active': isActiveSegment(i) }"
              @mouseenter="hoverSegment(i)"
              @click="toggleTo(i)"
            >
              <span class="seg-mark px" aria-hidden="true">{{
                isActiveSegment(i) ? '▶' : '·'
              }}</span>
              <span class="seg-name px">{{ key }}</span>
              <span class="seg-cn">{{ segmentLabel(key) }}</span>
              <span class="seg-count px" :class="{ 'is-dirty': (diffs[key]?.length ?? 0) > 0 }">{{
                changedMark(key)
              }}</span>
            </div>
          </div>
          <p v-if="!segments.length" class="seg-none hint">
            还没有任何段。用下面的「添加段」加一段，或从别处复制一份配置粘进来。
          </p>

          <!-- 添加段：段名是自由结构的键，所以允许自定义（契约之外的段同样整份写回去）。
               左列只有 260 来像素宽，标签与输入框不能并排挤成一条缝，改成上下两行 -->
          <div class="seg-add">
            <label class="seg-add-cap" for="admin-site-new-segment">添加段</label>
            <div class="seg-add-row">
              <input
                id="admin-site-new-segment"
                v-model="newKey"
                class="input"
                data-testid="admin-site-new-segment"
                aria-label="新段名"
                placeholder="段名，例如 home"
                spellcheck="false"
              />
              <button
                class="btn focusable mini"
                data-testid="admin-site-add-segment"
                @click="addSegment"
              >
                添加
              </button>
            </div>
          </div>
          <p v-if="addError" class="err" data-testid="admin-site-add-error">{{ addError }}</p>
        </section>

        <!-- 右列：当前段的编辑面板 -->
        <section class="edit-col" data-testid="admin-site-segment-panel" :data-segment="activeKey">
          <h2 class="panel-title">
            {{ segmentLabel(activeKey) }}
            <span class="panel-key px">（{{ activeKey || '未选择' }}）</span>
            <button
              v-if="activeKey"
              class="mini-btn focusable mini"
              data-testid="admin-site-restore"
              type="button"
              @click="restoreSegment"
            >
              {{ isNewSegment() ? '删除这一段' : '还原这一段' }}
            </button>
          </h2>

          <template v-if="activeKey">
            <!-- 非法 JSON：人话提示（哪一行 + 常见原因），保存同时被拦住 -->
            <p v-if="!activeOk" class="err" data-testid="admin-site-json-error">
              {{ activeError }}
            </p>

            <!-- 段内顶层字符串字段：带中文标签的原生输入框（Tab 在字段间走）。
                 文档型的那一种（`area`）框内右上角带展开图标，按 F2 也能开；
                 单行字段不加 —— 这一栏本来就窄，只有写长文才需要换画布 -->
            <div class="fields">
              <div
                v-for="row in activeFields"
                :key="row.key"
                class="field"
                :data-field="`${activeKey}.${row.key}`"
                data-testid="admin-site-field"
              >
                <label class="field-cap" :for="fieldId(row.key)">{{ row.label }}</label>
                <input
                  v-if="row.kind === 'text'"
                  :id="fieldId(row.key)"
                  class="input"
                  :value="row.text"
                  :disabled="!activeOk"
                  spellcheck="false"
                  @input="onField(row.key, $event)"
                />
                <!-- 文档型的那一格：图标摆在这一格的框里（右上角），F2 同效 -->
                <div v-else-if="row.kind === 'area'" class="area-wrap">
                  <textarea
                    :id="fieldId(row.key)"
                    class="input area"
                    rows="3"
                    :value="row.text"
                    :disabled="!activeOk"
                    spellcheck="false"
                    @input="onField(row.key, $event)"
                    @keydown="onFieldKey($event, row)"
                  ></textarea>
                  <button
                    class="expand"
                    data-testid="admin-site-expand"
                    type="button"
                    :data-key="row.key"
                    :aria-label="`编辑全文：${row.label}`"
                    title="编辑全文（F2）"
                    @click="openFieldLong(row)"
                  >
                    <ExpandGlyph />
                  </button>
                </div>
                <span v-else class="struct px">{{ row.text }}</span>
              </div>
            </div>
            <p class="tip hint">
              数组与嵌套对象不拆成几十个格子，在下面这一段 JSON
              里改；上面每个格子改的都是同一份数据。
            </p>

            <!-- 整段 JSON：自由结构段的兜底编辑面，也是「未知键原样保留」的保证。
                 它本身就是文档型，所以也配框内那个展开图标 -->
            <div class="json-box">
              <label class="json-cap px" for="admin-site-json">这一段 JSON（整段写回）</label>
              <div class="json-wrap">
                <textarea
                  id="admin-site-json"
                  class="json"
                  data-testid="admin-site-json"
                  spellcheck="false"
                  :aria-label="`${activeKey} 这一段的 JSON`"
                  :value="textOf(activeKey)"
                  @input="onJson"
                  @keydown="onJsonKey"
                ></textarea>
                <button
                  class="expand"
                  data-testid="admin-site-json-expand"
                  type="button"
                  aria-label="编辑全文：这一段的 JSON"
                  title="编辑全文（F2）"
                  @click="openJsonLong"
                >
                  <ExpandGlyph />
                </button>
              </div>
            </div>

            <!-- 改动对照：叶子路径级的 - 旧 / + 新，改了什么一眼看得见 -->
            <section class="diff">
              <h2 class="diff-title">改动对照（{{ activeDiff.length }}）</h2>
              <p v-if="!activeOk" class="hint">这一段的 JSON 还没写合法，暂时比不了。</p>
              <p v-else-if="!activeDiff.length" class="hint">这一段与读回来的原文一致。</p>
              <ul v-else class="diff-list">
                <li
                  v-for="line in activeDiff"
                  :key="line.path"
                  class="diff-line"
                  data-testid="admin-site-diff-line"
                  :data-path="line.path"
                  :data-kind="line.kind"
                >
                  <span class="diff-path px">{{ line.path }}</span>
                  <span v-if="line.kind !== 'added'" class="diff-old px">- {{ line.before }}</span>
                  <span v-if="line.kind !== 'removed'" class="diff-new px">+ {{ line.after }}</span>
                </li>
              </ul>
            </section>
          </template>

          <p v-else class="hint">左边还没有段可选：先添加一段。</p>
        </section>
      </div>

      <!-- 底栏：保存 / 重新读取 + 反馈。反馈就摆在按钮边上，不用回头找 -->
      <footer class="savebar">
        <div class="save-msgs">
          <p v-if="savedFlash" class="ok" data-testid="admin-site-saved">
            ✓ 保存成功，刷新页面后生效
          </p>
          <p v-else-if="saveError" class="err" data-testid="admin-site-save-error">
            {{ saveError }}
          </p>
          <p v-else class="hint px">
            共 {{ totalChanges }} 处改动 · 保存写整份 dict（未改动的段原样写回）
          </p>
          <p v-if="invalidKeys.length" class="err px" data-testid="admin-site-invalid-summary">
            有 {{ invalidKeys.length }} 段的 JSON 还没写合法：{{ invalidKeys.join(' / ') }}
          </p>
        </div>
        <button
          class="btn focusable"
          data-testid="admin-site-save"
          type="button"
          :class="{ 'is-focused': zone === 'save' }"
          :disabled="saving || invalidKeys.length > 0"
          @mouseenter="hoverZone('save')"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存整份配置' }}
        </button>
        <button
          class="btn ghost focusable"
          data-testid="admin-site-reload"
          type="button"
          :class="{ 'is-focused': zone === 'reload' }"
          :disabled="saving"
          @mouseenter="hoverZone('reload')"
          @click="load"
        >
          <!-- 按钮自己把代价写在脸上：有未保存的改动时，这一下会丢掉它们（不用模态再问一遍） -->
          {{ totalChanges > 0 ? `重新读取（丢弃 ${totalChanges} 处改动）` : '重新读取' }}
        </button>
      </footer>
    </div>

    <div class="foot sticky-foot px hint">
      ↑↓ 选段 / 按钮 · ENTER 打开这一段 · TAB 走字段与按钮 · F2 编辑全文 · Q 返回 · P / ESC
      菜单
    </div>

    <!-- 长文本编辑：页内模态，一次只开一个（`editing` 非空就是开着）。
         遮罩点击不关闭是有意的 —— 框里可能是整段 JSON，一次误点不该丢 -->
    <TextEditorDialog
      v-if="editing"
      :label="editing.label"
      :value="editing.value"
      :maxlength="editing.maxlength"
      :placeholder="editing.placeholder"
      :mono="editing.mono"
      @save="onLongSave"
      @close="closeLongText"
    />
  </div>
</template>

<style scoped>
/* 配色一律走 CSS 变量（tokens.generated.css），这里没有一个色值字面量、
   没有渐变 / 圆角 / 投影 / 模糊；动效都由全局的 steps() 管 */
.admin-site {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 14px;
}

.head-tag {
  color: var(--blue-600);
}

.back {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

/* ── 页头 ── */
.lead {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lead-title {
  margin: 0;
  color: var(--blue-700);
}

.lead-desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-soft);
  max-width: 96ch;
}

.lead-meta {
  margin: 0;
}

/* 装饰网点条：高度锁 8px（--grid 的整数倍），只做质感不做信息 */
.lead-dither {
  height: 8px;
  border: 2px solid var(--blue-300);
}

/* ── 四态（写法照 PostListView / UserProfileView 的空态） ── */
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 3px dashed var(--blue-400);
  padding: 20px;
  min-height: 200px;
  text-align: center;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin: 0;
  color: var(--ink);
}

.state-hint {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.9;
  max-width: 66ch;
}

.state code {
  font-family: 'ArkPixel', 'JetBrains Mono', 'Noto Sans Mono', monospace;
  color: var(--blue-700);
}

/* ── 编辑区：左段列表 / 右编辑面板 ── */
/* ── 底栏：保存 / 重新读取 + 反馈 ──
 *
 * `flex: 1 0 auto` 里那个 **0 是修出来的**，别改回 `flex: 1`（= `1 1 auto`）：
 * 页面根节点被 `.screen-inner > *` 定了 `flex: 1 1 auto; min-height: 100%`，
 * 高度只有一屏。`flex-shrink: 1` 会让 `.work` 在内容更高时**被压回一屏内的 301px**，
 * 而它的内容（左段列表 + 编辑区 + 保存栏）有 704px —— 溢出的那部分会跑到 `.work`
 * 的盒子外面，紧随其后的 `.foot` 于是落在「`.work` 的盒子底」而不是「内容底」上：
 * 实测滚到底时快捷键指引停在屏幕 y=190（页面中部、JSON 编辑器上方），
 * 保存栏却在它下面 y=524 —— 用户看到的就是「快捷键指引压在保存栏上面」。
 * 不许收缩之后 `.work` = 内容高，`.foot` 回到保存栏下面，同时保持「内容不足一屏时撑满」。
 */
.work {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.cols {
  display: grid;
  grid-template-columns: 268px 1fr;
  gap: 14px;
  align-items: start;
}

.seg-col,
.edit-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 12px;
}

.col-title,
.panel-title,
.diff-title {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
  border-bottom: 2px solid var(--blue-200);
  padding-bottom: 6px;
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.panel-key {
  color: var(--ink-soft);
}

.mini-btn {
  margin-left: auto;
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

.seg-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.seg {
  display: flex;
  align-items: baseline;
  gap: 8px;
  border: 2px solid var(--blue-200);
  background: var(--paper);
  padding: 6px 8px;
  cursor: pointer;
}

/* 「光标停在它上面」与「已经打开它」是两件事：前者是共享焦点的蓝底（全局那套），
   后者用配色与描边区分，免得看错自己在改哪一段 */
.seg.is-active {
  border-color: var(--blue-600);
}

.seg.is-active .seg-cn {
  color: var(--blue-700);
}

.seg-mark {
  color: var(--blue-500);
}

.seg-name {
  color: var(--ink-soft);
}

.seg-cn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink);
}

.seg-count {
  margin-left: auto;
  color: var(--ink-faint);
}

.seg-count.is-dirty {
  color: var(--spark);
}

.seg-none {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
  line-height: 1.8;
}

.seg-add {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

.seg-add-cap {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink-soft);
}

.seg-add-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.seg-add-row .input {
  flex: 1 1 auto;
  min-width: 0;
}

/* 按钮不参与压缩：flex 默认允许把中文按钮压到「一个字一行」（实测「添加」被挤成两行） */
.seg-add-row .btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* ── 字段 ── */
.fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.field-cap {
  flex: 0 0 118px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  padding-top: 8px;
}

.input {
  flex: 1 1 auto;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13.5px;
  color: var(--ink);
  background: var(--paper);
  border: 2px solid var(--blue-400);
  padding: 6px 8px;
}

/* 输入框的原生焦点用描边 + 浅蓝底（插入光标就是焦点指示，不再叠两侧闪烁方块） */
.input:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.input:disabled {
  opacity: 0.55;
}

.area {
  resize: vertical;
  line-height: 1.7;
  min-height: 62px;
}

.struct {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 9px;
  color: var(--ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tip {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
  line-height: 1.8;
}

/* ── 整段 JSON ── */
.json-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.json-cap {
  color: var(--blue-600);
}

/*
 * 文档型文本框的包装：图标要**贴在这一格的框里**（右上角），所以需要一层定位上下文。
 * 图标不加 `.focusable`（那是外壳自绘光标那一套），走浏览器原生 Tab 顺序。
 */
.area-wrap,
.json-wrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

/* 给图标让出右上角，免得第一行文字压到它下面 */
.area-wrap .input,
.json-wrap .json {
  width: 100%;
  padding-right: 30px;
}

.expand {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  font-size: 12px;
  padding: 0;
  background: var(--paper);
  border: 2px solid var(--blue-300);
  color: var(--blue-600);
  cursor: pointer;
}

.expand:hover,
.expand:focus-visible {
  background: var(--blue-100);
  border-color: var(--blue-500);
  color: var(--blue-700);
  outline: none;
}

.json {
  width: 100%;
  min-height: 190px;
  resize: vertical;
  font-family: 'ArkPixel', 'JetBrains Mono', 'Noto Sans Mono', monospace;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--ink);
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 8px;
}

.json:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

/* ── 改动对照 ── */
.diff {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-title {
  border-bottom-width: 0;
  padding-bottom: 0;
}

.diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diff-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  border-left: 6px solid var(--blue-300);
  background: var(--blue-100);
  padding: 4px 8px;
}

.diff-line[data-kind='changed'] {
  border-left-color: var(--blue-500);
}

.diff-line[data-kind='added'] {
  border-left-color: var(--blue-600);
}

.diff-line[data-kind='removed'] {
  border-left-color: var(--spark);
}

.diff-path {
  color: var(--ink-soft);
  flex: 0 0 auto;
}

.diff-old {
  color: var(--spark);
  overflow-wrap: anywhere;
}

.diff-new {
  color: var(--blue-700);
  overflow-wrap: anywhere;
}

/* ── 底栏：保存 / 重新读取 ── */
.savebar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-top: 3px solid var(--blue-300);
  padding-top: 10px;
}

.save-msgs {
  flex: 1 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.btn {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13.5px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--blue-700);
  padding: 8px 16px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.ghost {
  color: var(--ink-soft);
}

.ok {
  margin: 0;
  padding: 6px 10px;
  background: var(--blue-100);
  border-left: 8px solid var(--blue-600);
  color: var(--blue-700);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.7;
}

/* 失败提示：后端 detail 原文 + 本地校验的人话，共用同一条「硬边 + 品红刃」语言 */
.err {
  margin: 0;
  padding: 6px 10px;
  background: var(--blue-100);
  border-left: 8px solid var(--spark);
  color: var(--spark);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.7;
}

.foot {
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 900px) {
  .cols {
    grid-template-columns: 1fr;
  }

  .field {
    flex-direction: column;
    gap: 4px;
  }

  .field-cap {
    flex: 0 0 auto;
    padding-top: 0;
  }
}
</style>
