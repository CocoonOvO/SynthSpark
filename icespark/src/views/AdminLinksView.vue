<script setup lang="ts">
/**
 * ADMIN-LINKS 场景：外链管理（P5，路由 `/admin/links`）
 *
 * 管的是**同一批外链**的另一种视角：`/links`（`LinksView.vue`）是公开只读的卡片墙，
 * 这里是超管把它们读出来改（增 / 删 / 改）。接口与字段口径写在架构 §23.2：
 *   · 读  `GET /api/links/`（公开）→ `Link[]`：id / name / url / cover_image / sort_order
 *   · 写  `POST /api/links/`、`PUT /api/links/{link_id}`、`DELETE /api/links/{link_id}`（仅超管）
 *
 * ── 几条口径先行写清，免得后来的人「顺手」改掉 ──
 *
 * 1. **url 规则不在这里实现**。`http(s)://` 绝对链接或 `/` 开头的站内路径、拒绝 `//` 与
 *    `javascript:` —— 这套判定**属于后端**（架构 §23.2 明确「前端不重复实现」）。页面只做
 *    「必填」这一层 HTML 约束，格式错就照原样把后端 `detail` 贴出来。自己再写一遍的代价是
 *    两套规则迟早漂移，而用户看到的是哪一套取决于请求有没有发出去。
 *
 * 2. **鉴权的两半分工**（§23.1，别在两处都写）：
 *    · 未登录 → 路由守卫送回主页并弹登录框，页面**不管**；
 *    · 登录了但不是超管 → 路由照常进来（`meta.requiresSuperuser` 只是声明，守卫不拦），
 *      **页面自己**渲染「仅超管可见」，并且不带任何真内容节点（连 `GET /api/links/` 都不发）。
 *      登录了的人有权知道这页少了什么，所以不重定向。
 *    · `is_superuser` 是异步来的（外壳 `bootstrapAuth()` 校验 `/api/auth/me`），所以
 *      挂载时先看一眼缓存、再 `watch` 一次 —— 深链接 + 冷缓存时页面会在校验完成后自己打开。
 *
 * 3. **就地更新，不整页刷新**：写入接口返回整份对象，直接 upsert 进本地列表并按
 *    `sort_order` 重排（小的在前）。`fetchLinks()` 只在进页面时跑一次 —— 这也是 e2e 里
 *    「写完之后 GET 次数没变」那条断言的由来。
 *
 * 4. **四态显式**：loading / ready / empty / error，失败把后端 `detail` 原文（`ApiError.message`）
 *    显示出来，不吞异常、不白屏、不弹 `alert`。列表与表单分开降级：列表读挂了，表单还在，
 *    用户至少能试着新建一条（真挂了后端照样会说话）。
 *
 * 5. **首页 / 关于页同一套键位提示**（§23.3 硬要求 5）：页脚一行，措辞与 `HomeView` /
 *    `AboutView` 一致。页面**不画**品牌与站点状态行 —— 那是外壳 `.deck` 的活。
 *
 * ── 输入模型（结构照 `UserProfileView.vue`，说的话也一样） ──
 *
 * 自定义焦点只覆盖两块**看得见的动作**：页头那颗「新建」按钮，以及每张卡片的
 * 「编辑 / 删除」两个按钮（平铺成 `卡 * 2` 的一维索引，`spatialIndex` 按视觉相邻走）。
 * 表单**不进**自定义焦点：输入框用原生焦点，Tab 在四个字段与保存按钮之间走
 * （本页没有标签栏，外壳把 Tab 还给浏览器 —— 见 `App.vue` 全局监听器那条注释）。
 *
 * 三条惯例与 §21、§23.3 一字不差：
 *   · 方向键 / 鼠标 hover 一动 → `focusShellRoot()` 收掉原生焦点（**不是 `blur()`**：
 *     焦点掉到 `body` 之后键盘事件不再冒泡到外壳，整块键盘当场失灵）；
 *   · 原生焦点落在真实按钮上时回车归浏览器（`nativeOwnsEnter()`），否则那一格动作会被
 *     本页的 `confirm` 吞掉；
 *   · 输入框里根本收不到方向键 —— 外壳的 `isEditableTarget` 把可编辑元素整个让给浏览器，
 *     所以「方向键一动收掉原生焦点」说的是**焦点停在按钮上**的那条路径。
 *
 * **ESC 一律不消费**（基础态）：全站口径是「ESC = 菜单」，这里 `cancel` 直接 `return false`。
 * 唯一的例外是删除确认框开着时 —— 页内模态必须能被 ESC 关掉，否则键盘用户被关在里面
 * （`LoginDialog.vue` 是同一个先例）。基础态不吃 ESC 这件事 e2e 有断言。
 *
 * **放大编辑**（用户反馈：窄格里写长文本不方便）：名称 / 链接 / 配图三格各给一个 `F2` /
 * 「放大」按钮打开的弹窗（`machine/TextEditorDialog.vue`）。保存写回的还是表单里那三个字段，
 * 数据流没变；**排序**是 `type="number"`，不进这一套。
 * 于是这里有两个页内模态，`onPad` 的首行守卫按「谁开着」分流。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { createLink, deleteLink, fetchLinks, updateLink, type LinkPayload } from '@/api/links'
import type { Link } from '@/api/types'
import { spatialIndex, useFocusGroup } from '@/input/focus'
import { focusShellRoot } from '@/input'
import { pageModalOpen } from '@/input/scopes'
import { onPad, type PadAction } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import TextEditorDialog from '@/machine/TextEditorDialog.vue'
import { useStatusBar } from '@/scene/clock'
import { useLongText, type LongTextField } from '@/scene/longtext'
import { canGoBack, goBack, goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { clock, stop } = useStatusBar()

/* ══════════════════════════════════════════════
   列表：四态 + 就地更新
   ══════════════════════════════════════════════ */

/** 四态显式（§23.3 硬要求 4）：读取中 / 有数据 / 空 / 读失败 */
type ListState = 'loading' | 'ready' | 'empty' | 'error'

const listState = ref<ListState>('loading')
/** 读失败时后端 `detail` 的原文 */
const listError = ref('')
const links = ref<Link[]>([])

/** 排序副本：`sort_order` 小的在前；相等时保持后端给的先后（Array.sort 稳定） */
function sortLinks(list: Link[]): Link[] {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

/**
 * 错误原文。`ApiError.message` 就是 `client.ts` 从响应体里抠出来的 `detail`
 * （字符串原样、422 数组取第一条 `msg`）—— 这里再包一层只是为了让非 ApiError
 * 的意外（例如代码 bug）也有话可说，而不是白屏。
 */
function detailOf(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : String(err)
}

async function load(): Promise<void> {
  listState.value = 'loading'
  listError.value = ''
  try {
    const list = await fetchLinks()
    links.value = sortLinks(list ?? [])
    listState.value = links.value.length ? 'ready' : 'empty'
  } catch (err) {
    listError.value = detailOf(err)
    listState.value = 'error'
  }
}

onMounted(() => {
  scrollScreenTop()
  // 超管身份可能还没到（bootstrapAuth 是异步的），先按缓存看一眼
  if (auth.isSuperuser) void load()
})

/**
 * 拿到超管身份的那一刻才去读。为什么需要：`/api/auth/me` 未 resolve 前 `isSuperuser` 为假，
 * 页面此时渲染「仅超管可见」；校验完成后必须自动打开，否则真超管刷新一次就以为没权限。
 */
watch(
  () => auth.isSuperuser,
  (isSuper) => {
    if (isSuper) void load()
  },
)

onUnmounted(stop)

/* ══════════════════════════════════════════════
   表单：新建 / 编辑同一个面板
   ══════════════════════════════════════════════ */

const form = reactive({ name: '', url: '', cover: '', sort: '0' })
/** 正在编辑的那条 id；null = 新建模式 */
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')
const formNote = ref('')
/** 列表区的一条结果 / 失败提示（删除用；保存的提示在表单里） */
const actionError = ref('')
const actionNote = ref('')

const nameEl = ref<HTMLInputElement | null>(null)
const delCancelEl = ref<HTMLButtonElement | null>(null)

const formTitle = computed(() => (editingId.value ? '编辑外链' : '新建外链'))
const submitLabel = computed(() =>
  saving.value ? '保存中…' : editingId.value ? '保存修改' : '新建外链',
)

function blankForm(): void {
  editingId.value = null
  form.name = ''
  form.url = ''
  form.cover = ''
  form.sort = '0'
}

/** 切回新建模式并把光标放进第一个字段（原生焦点，键盘用户直接能打字） */
function startNew(): void {
  blankForm()
  formError.value = ''
  formNote.value = ''
  playSfx('confirm')
  void nextTick(() => nameEl.value?.focus())
}

function startEdit(l: Link): void {
  editingId.value = l.id
  form.name = l.name
  form.url = l.url
  form.cover = l.cover_image ?? ''
  form.sort = String(l.sort_order ?? 0)
  formError.value = ''
  formNote.value = ''
  playSfx('confirm')
  void nextTick(() => nameEl.value?.focus())
}

/** 排序值：`type=number` 已经挡掉大部分非法输入，这里只做一次收敛，不让 NaN 变成 null 打到后端 */
function parseSort(raw: string): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

/** 保存成功后就地更新：同 id 替换、新 id 追加，然后重排 */
function upsert(saved: Link): void {
  links.value = sortLinks([...links.value.filter((x) => x.id !== saved.id), saved])
  listState.value = links.value.length ? 'ready' : 'empty'
}

async function submitForm(): Promise<void> {
  if (saving.value) return
  saving.value = true
  formError.value = ''
  formNote.value = ''
  actionError.value = ''

  // 请求体就是契约 `ExternalLinkCreate` 的四项，一个不多一个不少：
  // 配图空串按「没有」送 null（后端是可空字段），排序缺省送 0。
  const payload: LinkPayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    cover_image: form.cover.trim() || null,
    sort_order: parseSort(form.sort),
  }

  try {
    const id = editingId.value
    if (id) {
      const saved = await updateLink(id, payload)
      // 后端照约定回整份对象；真回了个空壳就退回重新读一遍，别让列表和库里说的不一样
      if (saved?.id) upsert(saved)
      else await load()
      formNote.value = `已保存「${payload.name}」`
      focusCard(id)
    } else {
      const created = await createLink(payload)
      if (created?.id) {
        upsert(created)
        // 保存完顺手切到「编辑这条」：再改一次不用重新去列表里找
        editingId.value = created.id
        formNote.value = `已新建「${payload.name}」`
        focusCard(created.id)
      } else {
        await load()
        formNote.value = `已新建「${payload.name}」`
      }
    }
    focusShellRoot()
  } catch (err) {
    // 后端说不行就是不行：原文照贴（400 的字符串 detail、422 的第一条 msg 都走这条）
    formError.value = detailOf(err)
  } finally {
    saving.value = false
  }
}

/* ══════════════════════════════════════════════
   删除：页内二次确认（不是 window.confirm）
   ══════════════════════════════════════════════ */

const delTarget = ref<Link | null>(null)
const deleting = ref(false)
/** 0 = 取消、1 = 确认删除。默认停在「取消」那一侧：误按一次回车不该删掉数据 */
const delFocus = useFocusGroup({ initial: 0 })
const DEL_BUTTONS = 2

function askDelete(l: Link): void {
  delTarget.value = l
  // 告诉外壳「页内有模态开着」：不然按 P 会在确认框上再压一层暂停菜单（§17.8 的单模态口径）
  pageModalOpen.value = true
  delFocus.set(0, true)
  actionError.value = ''
  actionNote.value = ''
  playSfx('confirm')
  // 原生焦点交给「取消」：屏幕阅读器跟着进来，Tab 也有落点
  void nextTick(() => delCancelEl.value?.focus())
}

/** 关掉确认框。焦点必须收回外壳根节点：对话框一卸载原生焦点会掉回 body，键盘随即失灵（§21） */
function closeDelete(): void {
  delTarget.value = null
  pageModalOpen.value = false
  focusShellRoot()
}

async function confirmDelete(): Promise<void> {
  const target = delTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await deleteLink(target.id)
    links.value = links.value.filter((x) => x.id !== target.id)
    listState.value = links.value.length ? 'ready' : 'empty'
    // 正在编辑的就是被删掉的那条 → 表单退回新建模式，别留着一份已消失的记录
    if (editingId.value === target.id) blankForm()
    actionNote.value = `已删除「${target.name}」`
    closeDelete()
    clampFocus()
  } catch (err) {
    actionError.value = detailOf(err)
    closeDelete()
  } finally {
    deleting.value = false
  }
}

/* ══════════════════════════════════════════════
   焦点：自定义焦点只覆盖动作按钮，表单走原生焦点
   ══════════════════════════════════════════════ */

/** `new` = 「新建」按钮 · `card` = 卡片动作按钮 · `form` = 焦点在表单里（不自绘光标） */
type Zone = 'new' | 'card' | 'form'

/** 每张卡两个动作按钮，平铺成一维：`i * 2 + 0` 编辑、`+ 1` 删除 */
const ACTIONS_PER_CARD = 2

const zone = ref<Zone>('new')
const cardFocus = useFocusGroup({ initial: 0 })
const targetCount = computed(() => links.value.length * ACTIONS_PER_CARD)

function cardOf(i: number): number {
  return Math.floor(i / ACTIONS_PER_CARD)
}
function isEditSlot(i: number): boolean {
  return i % ACTIONS_PER_CARD === 0
}

function isNewFocused(): boolean {
  return zone.value === 'new'
}
function isActionFocused(card: number, action: 'edit' | 'del'): boolean {
  if (zone.value !== 'card') return false
  return cardFocus.index.value === card * ACTIONS_PER_CARD + (action === 'edit' ? 0 : 1)
}

/** 把光标放到某条外链的「编辑」上（新建 / 保存完成后用它给一个落点） */
function focusCard(id: string): void {
  const i = links.value.findIndex((x) => x.id === id)
  if (i < 0) return
  zone.value = 'card'
  cardFocus.set(i * ACTIONS_PER_CARD, true)
}

/** 删完之后索引可能越界，收敛到最后一个动作；列表空了就回到「新建」 */
function clampFocus(): void {
  const n = targetCount.value
  if (n <= 0) {
    zone.value = 'new'
    return
  }
  if (cardFocus.index.value >= n) cardFocus.set(n - 1, true)
}

/**
 * 原生焦点收口（惯例一）。为什么不能 `blur()`：见文件头与 `src/input/index.ts`。
 */
function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  focusShellRoot()
}

/** 原生焦点在「会响应回车的元素」上时，回车归浏览器（惯例二） */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

/** 鼠标划过：共享同一个焦点（静音），顺手收掉原生焦点 —— 屏幕上永远只有一个光标 */
function hoverNew(): void {
  dropNativeFocus()
  zone.value = 'new'
}
function hoverAction(card: number, action: 'edit' | 'del'): void {
  dropNativeFocus()
  zone.value = 'card'
  cardFocus.hover(card * ACTIONS_PER_CARD + (action === 'edit' ? 0 : 1))
}
/** 输入框拿到焦点：取消自绘光标，让插入光标成为唯一指示（与 LoginDialog 的注释同一条道理） */
function onFieldFocus(): void {
  zone.value = 'form'
}

function clickAction(l: Link, action: 'edit' | 'del'): void {
  if (action === 'edit') startEdit(l)
  else askDelete(l)
}

/** Q：全站的历史后退键；深链接直接打开时历史里没有上一页，兜底回主页（与用户档案页同源） */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/**
 * 删除确认框开着时，按键归它所有。
 * 这里**消费 ESC** 是刻意的：页内模态必须能被 ESC 关掉，否则键盘用户被关在里面
 * （`LoginDialog.vue` / `PauseMenu.vue` 都是同一个口径）。基础态不吃 ESC —— 见下面的 `off`。
 */
function dialogPad(a: PadAction): boolean {
  if (a === 'cancel' || a === 'back') {
    closeDelete()
    return true
  }
  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    if (delFocus.index.value === 0) closeDelete()
    else void confirmDelete()
    return true
  }
  if (a === 'left' || a === 'right') {
    const next = spatialIndex(delFocus.index.value, a, DEL_BUTTONS, DEL_BUTTONS)
    if (next === null) return false
    dropNativeFocus()
    delFocus.set(next)
    return true
  }
  return false
}

/* ══════════════════════════════════════════════
   放大编辑（用户反馈：窄格里写长文本不方便）
   ══════════════════════════════════════════════ */

/**
 * 可放大编辑的三格 —— **排序不进**：它是 `type="number"`，
 * 在大框里写「整数，小的在前」没有任何意义。
 */
type LinkLongKey = 'name' | 'url' | 'cover'

const LONG_FIELDS: Record<LinkLongKey, Omit<LongTextField, 'value'>> = {
  name: {
    key: 'name',
    label: '名称',
    maxlength: 100,
    focusId: 'link-name',
    placeholder: '外链名称（1–100 字）',
    hint: '上限与那一格一致（≤100 字）。',
  },
  url: {
    key: 'url',
    label: '链接',
    maxlength: 500,
    focusId: 'link-url',
    placeholder: 'https://… 或 /api/services/xxx/',
    hint: 'URL 规则由后端判定，这里只是把一行写得下。',
  },
  cover: {
    key: 'cover',
    label: '配图',
    maxlength: 500,
    focusId: 'link-cover',
    placeholder: '可空，图片 URL',
    hint: '可空；填图片 URL。',
  },
}

const { editing, openLongText, closeLongText } = useLongText()

function openLong(key: LinkLongKey): void {
  playSfx('confirm')
  openLongText({ ...LONG_FIELDS[key], value: form[key] })
}

/** F2 = 放大编辑这一格（内核 `KEYMAP` 里没有 F2，不会被外壳吃掉） */
function onFieldKey(event: KeyboardEvent, key: LinkLongKey): void {
  if (event.key !== 'F2') return
  event.preventDefault()
  openLong(key)
}

/** 弹窗保存：写回表单里那一个字段。先取 key 再关 —— `closeLongText()` 会把 `editing` 清空 */
function onLongSave(value: string): void {
  const key = editing.value?.key as LinkLongKey | undefined
  closeLongText()
  if (!key) return
  form[key] = value
}

/**
 * 放大编辑弹窗开着时的按键归属（与上面的 `dialogPad` 同一写法）。
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

const off = onPad((a) => {
  // 页内模态优先：它开着的时候别让底下的列表跟着动。
  // 两个模态各有各的分支，顺序无所谓（同时只会开一个：遮罩盖着整页，点不到另一个入口）
  if (editing.value) return longTextPad(a)
  if (delTarget.value) return dialogPad(a)

  if (a === 'back') {
    back()
    return true
  }

  // ESC 不消费：交还给外壳的全局监听器（全站口径「P / ESC 菜单」）。页面绝不能吃这个键，
  // 否则键盘用户在这一页就再也呼不出菜单。
  if (a === 'cancel') return false

  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    if (zone.value === 'new') {
      startNew()
      return true
    }
    const l = links.value[cardOf(cardFocus.index.value)]
    if (!l) return false
    clickAction(l, isEditSlot(cardFocus.index.value) ? 'edit' : 'del')
    return true
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 惯例一：方向键一动就收掉原生焦点（输入框里根本收不到这个键，见文件头）
    dropNativeFocus()

    if (zone.value !== 'card') {
      // 焦点在「新建」或表单里：下 → 第一张卡；上 → 回到「新建」
      if (a === 'down' && targetCount.value > 0) {
        zone.value = 'card'
        cardFocus.set(0, true)
        playSfx('move')
        return true
      }
      if (a === 'up' && zone.value === 'form') {
        zone.value = 'new'
        playSfx('move')
        return true
      }
      return false
    }

    const next = spatialIndex(cardFocus.index.value, a, ACTIONS_PER_CARD, targetCount.value)
    if (next === null) {
      // 首行再往上 → 焦点交给「新建」（表单面板在列表上面，视觉顺序一致）
      if (a === 'up' && cardFocus.index.value < ACTIONS_PER_CARD) {
        zone.value = 'new'
        playSfx('move')
        return true
      }
      return false
    }
    cardFocus.set(next)
    return true
  }

  return false
})
onUnmounted(off)

/** 编号铭牌：与公开的 `/links` 页同一套（没图标素材，序号即铭牌） */
function plate(i: number): string {
  return String(i + 1).padStart(2, '0')
}
</script>

<template>
  <div class="admin-links">
    <SceneHead title="外链管理 · LINKS" :clock="clock">
      <span v-if="auth.isSuperuser" class="px">{{ links.length }} 条</span>
    </SceneHead>

    <!-- 页面自带可见一级标题（`App.vue` 的 SELF_TITLED_SCENES 里有 admin-links，外壳不发隐藏 h1） -->
    <h1 class="page-title px px-36 px-display">外链管理</h1>

    <!-- 非超管：页内提示，且**没有任何真内容节点**（表单与列表都不渲染，接口也不发） -->
    <div v-if="!auth.isSuperuser" class="state px" data-testid="admin-links-denied">
      <p class="state-title">仅超管可见</p>
      <p class="state-hint hint">
        这一页管理「关联」页那一批外链（GET /api/links/ 的增删改），只有超管账号能用。
      </p>
    </div>

    <template v-else>
      <p class="lead px">
        管理「关联」页那一批外链：<b>GET /api/links/</b> 读取，<b>POST / PUT / DELETE</b> 仅超管。
        URL 由后端判定（<b>http(s)://</b> 绝对链接或 <b>/</b> 开头的站内路径），错误原文照贴。
      </p>

      <!-- ── 表单：新建 / 编辑同一个面板 ── -->
      <section class="panel" data-testid="link-form-panel">
        <div class="panel-head">
          <h2 class="panel-title">{{ formTitle }}</h2>
          <span v-if="editingId" class="panel-id px hint">#{{ editingId }}</span>
          <button
            class="btn mini focusable"
            data-testid="link-new"
            type="button"
            :class="{ 'is-focused': isNewFocused() }"
            @mouseenter="hoverNew"
            @click="startNew"
          >
            ＋ 新建
          </button>
        </div>

        <form class="form" data-testid="link-form" @submit.prevent="submitForm">
          <!-- 四格都是「标签 + 输入框 + 放大」的一行；名称 / 链接 / 配图三格带放大编辑，
               排序是数字框、不带（理由见脚本里的 LONG_FIELDS） -->
          <div class="field">
            <label class="field-cap" for="link-name">名称</label>
            <input
              id="link-name"
              ref="nameEl"
              v-model="form.name"
              class="input"
              data-testid="link-name"
              type="text"
              name="name"
              maxlength="100"
              required
              spellcheck="false"
              placeholder="外链名称（1–100 字）"
              @focus="onFieldFocus"
              @keydown="onFieldKey($event, 'name')"
            />
            <button
              class="expand"
              data-testid="link-name-expand"
              type="button"
              aria-label="放大编辑：名称"
              title="放大编辑（F2）"
              @click="openLong('name')"
            >
              放大
            </button>
          </div>

          <div class="field">
            <label class="field-cap" for="link-url">链接</label>
            <input
              id="link-url"
              v-model="form.url"
              class="input"
              data-testid="link-url"
              type="text"
              name="url"
              maxlength="500"
              required
              spellcheck="false"
              placeholder="https://… 或 /api/services/xxx/"
              @focus="onFieldFocus"
              @keydown="onFieldKey($event, 'url')"
            />
            <button
              class="expand"
              data-testid="link-url-expand"
              type="button"
              aria-label="放大编辑：链接"
              title="放大编辑（F2）"
              @click="openLong('url')"
            >
              放大
            </button>
          </div>

          <div class="field">
            <label class="field-cap" for="link-cover">配图</label>
            <input
              id="link-cover"
              v-model="form.cover"
              class="input"
              data-testid="link-cover"
              type="text"
              name="cover_image"
              maxlength="500"
              spellcheck="false"
              placeholder="可空，图片 URL"
              @focus="onFieldFocus"
              @keydown="onFieldKey($event, 'cover')"
            />
            <button
              class="expand"
              data-testid="link-cover-expand"
              type="button"
              aria-label="放大编辑：配图"
              title="放大编辑（F2）"
              @click="openLong('cover')"
            >
              放大
            </button>
          </div>

          <div class="field">
            <label class="field-cap" for="link-sort">排序</label>
            <input
              id="link-sort"
              v-model="form.sort"
              class="input input-sort"
              data-testid="link-sort"
              type="number"
              name="sort_order"
              step="1"
              placeholder="整数，小的在前"
              @focus="onFieldFocus"
            />
          </div>

          <!-- 写失败 / 成功都在这一行：失败是后端 detail 的原文，成功是就地更新的回执 -->
          <p v-if="formError" class="err" data-testid="link-form-error">✕ {{ formError }}</p>
          <p v-else-if="formNote" class="note" data-testid="link-form-note">✓ {{ formNote }}</p>
          <p v-else class="tip hint">名称与链接必填；URL 规则由后端判定，前端只负责显示原文。</p>

          <div class="actions">
            <button class="btn focusable" data-testid="link-save" type="submit" :disabled="saving">
              {{ submitLabel }}
            </button>
            <button
              class="btn ghost focusable"
              data-testid="link-reset"
              type="button"
              @click="startNew"
            >
              清空
            </button>
          </div>
        </form>
      </section>

      <!-- ── 列表：同一批外链的卡片墙（版面照公开的 /links 页），每张多两个动作 ── -->
      <section class="list-sec">
        <div class="sec-head">
          <h2 class="sec-title">已有外链</h2>
          <span class="px hint">{{ links.length }} 条</span>
        </div>

        <div v-if="listState === 'loading'" class="state px" data-testid="links-loading">
          <span class="blink">▌</span> 读取外链 …
        </div>

        <div v-else-if="listState === 'error'" class="state px" data-testid="links-error">
          <p class="state-title">外链读取失败。</p>
          <!-- 后端 detail 原文照贴：换一句「加载失败，请重试」等于把排查线索丢掉 -->
          <p class="state-hint hint" data-testid="links-error-detail">{{ listError }}</p>
        </div>

        <div v-else-if="listState === 'empty'" class="state px" data-testid="links-empty">
          <p class="state-title">还没有外链。</p>
          <p class="state-hint hint">
            在后端 <b>external_links</b> 表里一条都没有。用上面的表单填「名称」与「链接」，
            点「新建外链」就加上了（POST /api/links/）。
          </p>
        </div>

        <div v-else class="grid" data-testid="admin-links-grid">
          <article v-for="(l, i) in links" :key="l.id" class="card" data-testid="admin-link-card">
            <div class="card-top">
              <!-- 序号铭牌是装饰，不进可访问性树 -->
              <span class="plate px" aria-hidden="true">{{ plate(i) }}</span>
              <div class="card-main">
                <!-- 卡片标题 h2：h1 → h2 不跳级（a11y 用例钉着这条） -->
                <h2 class="card-name">{{ l.name }}</h2>
                <span class="card-url px">{{ l.url }}</span>
              </div>
            </div>

            <div class="card-actions">
              <button
                class="btn mini focusable"
                data-testid="link-edit"
                type="button"
                :class="{ 'is-focused': isActionFocused(i, 'edit') }"
                @mouseenter="hoverAction(i, 'edit')"
                @click="clickAction(l, 'edit')"
              >
                编辑
              </button>
              <button
                class="btn mini focusable danger"
                data-testid="link-del"
                type="button"
                :class="{ 'is-focused': isActionFocused(i, 'del') }"
                @mouseenter="hoverAction(i, 'del')"
                @click="clickAction(l, 'del')"
              >
                删除
              </button>
              <span class="card-sort px hint">#{{ l.sort_order }}</span>
              <span v-if="l.cover_image" class="card-tag px hint">▣ 配图</span>
            </div>
          </article>
        </div>

        <p v-if="actionError" class="err wide" data-testid="link-action-error">
          ✕ {{ actionError }}
        </p>
        <p v-else-if="actionNote" class="note wide" data-testid="link-action-note">
          ✓ {{ actionNote }}
        </p>
      </section>
    </template>

    <!-- ── 二次确认：页内模态，不用 window.confirm（那个框不可键盘导航、样式也不归我们） ── -->
    <div v-if="delTarget" class="del-mask" data-testid="link-del-mask" @click.self="closeDelete">
      <div
        class="del-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-link-title"
        data-testid="link-del-dialog"
      >
        <div class="del-head">
          <h2 id="del-link-title" class="panel-title">确认删除这条外链？</h2>
          <span class="del-dither dither-25" aria-hidden="true"></span>
        </div>

        <p class="del-body read">
          「<b>{{ delTarget.name }}</b
          >」<br />
          <span class="del-url px">{{ delTarget.url }}</span>
        </p>
        <p class="del-hint hint">
          删除后不可撤销，关联页上立刻就不见了（DELETE /api/links/{{ delTarget.id }}）。
        </p>

        <div class="actions">
          <button
            ref="delCancelEl"
            class="btn focusable"
            data-testid="link-del-cancel"
            type="button"
            :class="{ 'is-focused': delFocus.index.value === 0 }"
            @mouseenter="delFocus.hover(0)"
            @click="closeDelete"
          >
            取消
          </button>
          <button
            class="btn focusable danger"
            data-testid="link-del-confirm"
            type="button"
            :disabled="deleting"
            :class="{ 'is-focused': delFocus.index.value === 1 }"
            @mouseenter="delFocus.hover(1)"
            @click="confirmDelete"
          >
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>

        <div class="keys hint">←→ 选择 · ENTER 确认 · ESC 取消</div>
      </div>
    </div>

    <!-- 页脚一行键位提示：与首页 / 关于页同一套措辞（品牌与站点状态行由外壳 .deck 负责） -->
    <div class="foot sticky-foot px hint">
      ↑↓←→ 移动 · ENTER 确认 · TAB 到输入框 · F2 放大编辑这一格 · Q 返回 · P / ESC 菜单
    </div>

    <!-- 放大编辑：页内模态，一次只开一个（`editing` 非空就是开着）。
         遮罩点击不关闭是有意的 —— 框里可能写着一条长 URL，一次误点不该丢 -->
    <TextEditorDialog
      v-if="editing"
      :label="editing.label"
      :value="editing.value"
      :multiline="editing.multiline"
      :maxlength="editing.maxlength"
      :placeholder="editing.placeholder"
      :mono="editing.mono"
      :hint="editing.hint"
      @save="onLongSave"
      @close="closeLongText"
    />
  </div>
</template>

<style scoped>
.admin-links {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 14px;
}

.page-title {
  margin: 0;
}

.lead {
  margin: 0;
  color: var(--ink-soft);
}

.lead b {
  font-weight: 400;
  color: var(--blue-600);
}

/* ── 表单面板 ── */
.panel {
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  padding: 12px 14px 14px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: var(--border-thin) solid var(--blue-200);
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.panel-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  margin: 0;
  color: var(--blue-700);
}

.panel-id {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 32ch;
}

/* 「新建」贴在面板右上角：它是自定义焦点的第一格 */
.panel-head .btn {
  margin-left: auto;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-cap {
  flex: 0 0 44px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink-soft);
}

.input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  padding: 6px 8px;
}

.input-sort {
  flex: 0 0 120px;
}

/*
 * 「放大」触发器：不加 `.focusable`（那是外壳自绘光标那一套），走**浏览器原生 Tab 顺序** ——
 * 表单里的既定口径就是「输入框用原生焦点」，硬塞进 `.focusable` 会连方向键的焦点链一起改。
 */
.expand {
  flex: 0 0 auto;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 3px 7px;
  cursor: pointer;
}

.expand:hover,
.expand:focus-visible {
  background: var(--blue-100);
  outline: none;
  border-color: var(--blue-500);
}

/* 输入框的焦点：描边 + 浅蓝底（用插入光标当指示，不叠两侧闪烁方块） */
.input:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

/* ── 按钮：硬边、直角，焦点只换底色（配色全走 token） ── */
.btn {
  font: inherit;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  color: var(--blue-700);
  padding: 6px 12px;
  cursor: pointer;
}

/*
 * 「删除」这类破坏性动作只让描边变品红：`--spark` 在白底上的对比度只有 ~2.9:1，
 * 当文字色不合格（与 `NotFoundView.vue` 那条注释同一个结论）。
 */
.btn.danger {
  color: var(--blue-700);
  border-color: var(--spark);
}

.btn.ghost {
  color: var(--ink-soft);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.mini {
  padding: 3px 8px;
  border-width: var(--border-thin);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.err,
.note {
  margin: 0;
  padding: 6px 10px;
  background: var(--blue-100);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.err {
  border-left: 8px solid var(--spark);
  color: var(--blue-700);
}

.note {
  border-left: 8px solid var(--blue-500);
  color: var(--blue-700);
}

.err.wide,
.note.wide {
  margin-top: 10px;
}

.tip {
  margin: 0;
  font-size: 12px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
}

/* ── 列表 ── */
.list-sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sec-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: var(--border-thin) solid var(--blue-200);
  padding-bottom: 6px;
}

.sec-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  margin: 0;
  color: var(--blue-700);
}

.sec-head .px {
  margin-left: auto;
}

/*
 * 栅格与公开的 /links 页同一口径：两列、每格最小 120px。
 * 这里的卡片多一行动作按钮，所以行高交给内容自己撑。
 */
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  padding: 12px;
  min-width: 0;
}

.card-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

/* 序号铭牌：与 /links 页逐字同款（40px 方块、蓝底深字） */
.plate {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: var(--blue-200);
  border: var(--border-thin) solid var(--blue-500);
  color: var(--blue-700);
  font-size: 24px;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.card-name {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

.card-url {
  color: var(--ink-faint);
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: var(--border-thin) solid var(--blue-200);
  padding-top: 8px;
  margin-top: auto;
}

/* 排序号与「配图」标记靠右：卡片左下角留给两个动作按钮 */
.card-actions .card-sort {
  margin-left: auto;
}

/* ── 空态 / 加载态 / 失败态（写法照 PostListView / LinksView） ── */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: var(--border-frame) dashed var(--blue-400);
  min-height: 200px;
  padding: 18px;
  text-align: center;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin: 0;
}

.state-hint {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  max-width: 52ch;
}

.state-hint b {
  font-weight: 400;
  color: var(--blue-600);
}

/* ── 删除确认（页内模态） ── */
.del-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--veil-deep);
  display: grid;
  place-items: center;
  padding: 20px;
}

.del-panel {
  width: min(440px, 100%);
  background: var(--paper);
  border: var(--border-frame) solid var(--edge);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 14px 16px 16px;
}

.del-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: var(--border-frame) solid var(--blue-300);
  padding-bottom: 8px;
}

/* 装饰性网点条（唯一的「渐变」用法是抖动网点，配色只取 --blue-*） */
.del-dither {
  margin-left: auto;
  width: 72px;
  height: 12px;
  border: var(--border-hair) solid var(--blue-300);
}

.del-body {
  margin: 12px 0 6px;
  font-size: 14px;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.del-url {
  color: var(--ink-faint);
  font-size: 12px;
}

.del-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.7;
}

.keys {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
}

.foot {
  margin-top: auto;
  border-top: var(--border-thin) solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .field {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .field-cap {
    flex: 0 0 auto;
  }

  .input,
  .input-sort {
    width: 100%;
    flex: 1 1 auto;
  }
}
</style>
