<script setup lang="ts">
/**
 * 个人信息编辑页（P5，路由 `/profile`）。
 *
 * 旧前端是 `ProfileView.vue` 的「设置」tab，本轮按用户裁定**独立成页**（架构 §23）。
 * 这一页手上有四件事，口径全在 §23.2：
 *   1. 读 `GET /api/users/me` —— 要的是后端**现在记着的**值，不是登录时那份缓存；
 *   2. 写 `PUT /api/users/me` —— 只带**改动过**的字段（契约 `UserUpdate` 一共四个：
 *      `email` / `display_name` / `bio` / `avatar_url`），返回更新后的整份用户；
 *   3. 头像两拍：先 `POST /api/upload/avatar`（multipart）拿 `url` 写进表单，
 *      点保存后才随 `avatar_url` 一起提交 —— 旧前端原话就是「上传成功，点击保存设置后生效」；
 *      限制照抄旧前端：只能图片、≤5MB；
 *   4. 改密码 `POST /api/auth/password/reset` —— 参数走 **query string**（不是 JSON body），
 *      两次新密码不一致在前端先拦下（旧前端同样拦）；
 *   5. 长文本编辑：文档型文本框（这一页只有「简介」）在框内右上角有个展开图标，
 *      按 F2 也一样 —— 打开 `machine/TextEditorDialog.vue` 那块大画布。
 *      单行的昵称 / 邮箱、密码三格、头像文件框**都不接**（用户口径：只有文档形式的框需要）。
 *
 * ── 为什么有几处必须这么写（不是风格问题，是行为问题）──
 * · **保存后要同步 `stores/auth`**：暂停菜单那行账号昵称读的是 `auth.displayName`，
 *   只改页面自己的表单，菜单里还是旧昵称（§23.2 明写这一点）。这里调 `auth.loadMe()`
 *   重新拉一次 `/api/auth/me`，与旧前端「同步 authStore」是同一件事。
 * · **改密码走数据层的 `resetPassword()`**（`src/api/auth.ts`）：参数走 query string、
 *   body 留空，形状与登录相反（把参数塞进 JSON body 会被后端当成参数缺失）。
 *   这一段原本借 `client.request()` 长在页面里（§24.6 记过这笔账），现已经收回数据层。
 * · **绝不自己 `window.addEventListener('keydown')`**：全站唯一的键盘监听器是外壳的
 *   `mountInput`，页面只用 `onPad(handler)`，卸载时释放。
 * · **原生焦点的两条惯例**（§21，与文章页 / 用户档案页同源）：
 *   ① 回车落在真实 `button` / `a` / 表单域上时**让位浏览器**（`nativeOwnsEnter()`），
 *      否则一次回车会被页面与浏览器各处理一遍；
 *   ② 方向键一动就把原生焦点收回**外壳根节点**（`focusShellRoot()`，**绝不 `blur()`** ——
 *      焦点掉回 `body` 后键盘事件不再冒泡到外壳，整块键盘当场失灵，这是 §21 记下的真 bug）。
 *      同一个坑还有第二个入口：提交按钮在请求期间 `:disabled` 会被浏览器顺手丢掉焦点
 *      （掉回 `body`），所以提交收尾还要 `restoreShellFocus()` 补一下。
 * · **两个 `<form>` 都写 `novalidate`**：字段该由后端裁决，它的 `detail` 要能原样显示出来
 *   （§23.3）；留着浏览器自带的约束校验，非法邮箱会被原生气泡拦在提交之前。
 * · **文件输入框要额外松手**：`isEditableTarget()` 把 `INPUT` 一律当成「正在输入」，
 *   于是焦点停在 `<input type="file">` 上时 Q / P 之类全被它吃掉，键盘等于失活。
 *   它真正需要的只有 Tab / Enter / Space / ESC，其余按键一律交还外壳（见 `onFileKey`）。
 * · **ESC 不消费**：全站口径是 ESC 呼出菜单，这里只把方向键与 Q 收下。
 * · **四态**（§23.3）：`loading` / `ready` / `guest`（`fetchMe` 401，守卫之外的兜底）/
 *   `error`（把后端 `detail` 原文显示出来）。四态里可见 `h1` 都在 —— 这一页自带标题，
 *   外壳的 `SELF_TITLED_SCENES` 已经含 `profile`，不会再塞一个隐藏 h1。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { uploadAvatar } from '@/api/admin'
import { resetPassword } from '@/api/auth'
import { ApiError } from '@/api/client'
import { fetchMe, updateMe, type User, type UserUpdate } from '@/api/users'
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
import PixelAvatar from '@/signal/PixelAvatar.vue'
import { GRID_COLS, GRID_ROWS, GRID_TOTAL, emptyGrid, parseGridInput, type AvatarRows } from '@/signal/pixel-grid'
import { useAuthStore } from '@/stores/auth'
import { useAvatarStore } from '@/stores/avatars'
import { ACTIVE_PALETTE, PALETTES, avatarPalette } from '@/styles/tokens'

/** 头像调色板按当前配色方案现算（与列表 / 文章 / 用户档案页同一处改法，加主题时不用改这里） */
const AVATAR_PALETTE = avatarPalette(PALETTES[ACTIVE_PALETTE])

/** 头像上限：旧前端 `uploadApi.uploadAvatar` 写的就是 5MB，这里照抄 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
/** 契约上限（`UserUpdate`：display_name ≤100、bio ≤500），写在输入框上先挡一道 */
const NAME_MAX = 100
const BIO_MAX = 500

const { clock, stop } = useStatusBar()
const auth = useAuthStore()
const avatars = useAvatarStore()

/**
 * 四态。
 * `guest` 单列一态：路由守卫理论上已经拦下未登录，但令牌**过期 / 被撤销**时守卫是放行的
 * （本地还有 token），`GET /api/users/me` 会回 401 —— 那时必须给一条人话，
 * 而不是把 401 当成「后端炸了」，或者干脆白屏。
 */
type PageState = 'loading' | 'ready' | 'guest' | 'error'
const state = ref<PageState>('loading')

/** 后端现在记着的用户（只读用：`@username`、头像兜底面孔的名字） */
const user = ref<User | null>(null)

/** 读取失败的原文（后端 `detail`，或客户端兜底文案） */
const loadError = ref('')

/** 表单：只有契约 `UserUpdate` 那四个字段可编辑 */
const form = reactive({ email: '', display_name: '', bio: '', avatar_url: '' })
/** 上一次「与后端一致」的快照 —— 保存时拿它算差集，只提交改动过的字段 */
const baseline = reactive({ email: '', display_name: '', bio: '', avatar_url: '' })

/** 保存反馈：idle 无话 / saving / saved / error（错误时 message 就是后端原文） */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const saveState = ref<SaveState>('idle')
const saveMessage = ref('')

/** 头像上传三态（旧前端是 alert；本仓口径是不弹 alert，改成页内一行状态） */
const uploading = ref(false)
const uploadError = ref('')
const uploadNotice = ref('')

/** 改密码小节 */
const pw = reactive({ old: '', next: '', confirm: '' })
const pwBusy = ref(false)
const pwError = ref('')
const pwOk = ref('')

const fileEl = ref<HTMLInputElement | null>(null)

/** 错误原文：`ApiError.message` 已经是「后端 detail 原文 / HTTP 状态兜底」，直接用它 */
function detailOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/** 把一份 `User` 填进表单并把快照对齐 —— 快照对齐了，差集才算得准 */
function fill(u: User): void {
  user.value = u
  form.email = u.email ?? ''
  form.display_name = u.display_name ?? ''
  form.bio = u.bio ?? ''
  form.avatar_url = u.avatar_url ?? ''
  // 头像两栏：有图片就先看图片，没有图片但配过点阵就直接看那栏
  avatarMode.value = !form.avatar_url && myRows.value ? 'pixels' : 'photo'
  fillGridBox()
  baseline.email = form.email
  baseline.display_name = form.display_name
  baseline.bio = form.bio
  baseline.avatar_url = form.avatar_url
}

async function load(): Promise<void> {
  state.value = 'loading'
  loadError.value = ''
  try {
    fill(await fetchMe())
    state.value = 'ready'
    saveState.value = 'idle'
    saveMessage.value = ''
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // 页面只负责给一条人话。「要不要登出、清不清令牌」是 stores/auth 的决定
      // （外壳挂载时的 `bootstrapAuth()` 同样在判 `/api/auth/me`）；
      // 这里顺手 logout 会和它抢方向盘，还可能把外壳刚拉到的用户信息清掉。
      state.value = 'guest'
      return
    }
    loadError.value = detailOf(err, '账号信息读取失败。')
    state.value = 'error'
  }
}

/** 只把改动过的字段拼进请求体（契约 `UserUpdate` 是补丁语义，不是整份覆盖） */
function buildPayload(): UserUpdate {
  const payload: UserUpdate = {}
  const email = form.email.trim()
  const displayName = form.display_name.trim()
  if (email !== baseline.email) payload.email = email
  if (displayName !== baseline.display_name) payload.display_name = displayName
  if (form.bio !== baseline.bio) payload.bio = form.bio
  if (form.avatar_url !== baseline.avatar_url) payload.avatar_url = form.avatar_url
  return payload
}

/** 用户一动表单，旧的「已保存」反馈就该消失（否则文案会说谎） */
function clearSaveFeedback(): void {
  if (saveState.value === 'saving') return
  saveState.value = 'idle'
  saveMessage.value = ''
}

async function save(): Promise<void> {
  if (saveState.value === 'saving') return
  const payload = buildPayload()

  if (Object.keys(payload).length === 0) {
    saveState.value = 'saved'
    saveMessage.value = '没有要保存的改动'
    playSfx('confirm')
    return
  }

  saveState.value = 'saving'
  saveMessage.value = ''
  try {
    const updated = await updateMe(payload)
    // 契约说返回的是更新后的整份用户；真按契约来也照样合并一次 ——
    // 中间层 / e2e 夹具可能只回改动字段，合并后两种形状都对。
    fill({ ...(user.value as User), ...updated })
    // 同步外壳登录态：菜单里的昵称读 auth.user，不刷新就还是旧值（§23.2）
    await auth.loadMe()
    saveState.value = 'saved'
    saveMessage.value = '已保存'
    playSfx('confirm')
  } catch (err) {
    // 不吞异常、不弹 alert：把后端 detail 原文摆在保存按钮旁边
    saveState.value = 'error'
    saveMessage.value = detailOf(err, '保存失败，稍后再试。')
  } finally {
    restoreShellFocus()
  }
}

/** 选头像：先本地校验（类型 / 大小），再上传；上传成功只写进表单，保存时才生效 */
async function onAvatarChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 立刻清空：同一个文件再选一次也要能触发 change（旧前端同样处理）
  input.value = ''
  if (!file) return

  uploadError.value = ''
  uploadNotice.value = ''
  clearSaveFeedback()

  if (!file.type.startsWith('image/')) {
    uploadError.value = '只能上传图片文件'
    return
  }
  if (file.size > MAX_AVATAR_BYTES) {
    uploadError.value = '头像大小不能超过 5MB'
    return
  }

  uploading.value = true
  try {
    const res = await uploadAvatar(file)
    form.avatar_url = res.url
    uploadNotice.value = '头像已上传，点「保存资料」后生效'
  } catch (err) {
    uploadError.value = detailOf(err, '上传头像失败')
  } finally {
    uploading.value = false
  }
}

function removeAvatar(): void {
  form.avatar_url = ''
  uploadError.value = ''
  uploadNotice.value = ''
  clearSaveFeedback()
}

/* ────────────────────────── 点阵头像（icespark 自己那份） ──────────────────────────
 *
 * 与图片头像的关系（架构 §67）：
 *   · 展示优先级是 **图片 → 点阵 → 名字哈希**，这条只写在 `PixelAvatar` 里；
 *   · 所以「切换到点阵」要真的生效，就得把后端那张图片清掉 —— 保存点阵时顺手做，
 *     并且**明说**做了（否则用户会以为自己的图片还在）；
 *   · 反过来清掉点阵不会碰图片：图片还在的话，展示自然回到图片。
 *
 * 存储不在后端：这份点阵由 icespark 自己的 `/avatar` 路由管（本地文件、不入库），
 * 而且那条路由在静态部署里可能根本不存在 —— 那时 `gridAvailable` 为假，这一栏给一句人话。
 */
type AvatarMode = 'photo' | 'pixels'

/** 现在在看哪一栏：有图片头像时默认图片（先看见自己现在用的那个） */
const avatarMode = ref<AvatarMode>('photo')
/** 用户自己点过切换键没有 —— 点过一次就不再替他挑（否则会被自动跳栏拽走） */
const modePicked = ref(false)

const gridEl = ref<HTMLTextAreaElement | null>(null)

/** 我在 icespark 那份存储里的用户名（= 登录用户名；没登录时没有） */
const myName = computed(() => user.value?.username ?? '')
/** 我那一条点阵；没配过就是 null */
const myRows = computed(() => avatars.rowsFor(myName.value))
/** 这条路由在不在（静态部署里不在） */
const gridAvailable = computed(() => avatars.state !== 'unavailable')

/** 编辑框里的文本与它的解析结果（解析失败要有能读的原因，不能悄悄吞） */
const gridText = ref('')
const gridTouched = ref(false)
const gridParse = computed(() => parseGridInput(gridText.value))
const gridBusy = ref(false)
const gridError = ref('')
const gridNotice = ref('')

/**
 * 预览用的那一版：解析失败时**保持上一次合法的**。
 * 否则打到一半手滑，预览会突然变成「名字哈希那张脸」—— 看着像头像丢了。
 */
const gridPreview = ref<AvatarRows | null>(null)
watch(
  gridParse,
  (parsed) => {
    if (parsed.ok) gridPreview.value = parsed.rows
  },
  { immediate: true },
)

/** 把「已保存的那份」灌进编辑框（没配过就给一张空白画布） */
function fillGridBox(): void {
  // 字符串就是那张图本身（256 个字连写），一行装得下，不需要十六行框
  gridText.value = (myRows.value ?? emptyGrid()).join('')
  gridPreview.value = myRows.value ?? emptyGrid()
  gridTouched.value = false
}

/**
 * 别人（或另一次保存）改了我的那条时，只要编辑框还没被碰过就跟着刷新；
 * 顺便把「默认看哪一栏」补上一次 —— `fill()` 跑的时候映射可能还在路上
 * （`avatars.load()` 与 `fetchMe()` 是两条独立的请求，谁先回来不定），
 * 光靠 `fill()` 里那一判会变成看运气。
 */
watch(myRows, () => {
  if (!gridTouched.value) fillGridBox()
  if (!modePicked.value && !form.avatar_url && myRows.value) avatarMode.value = 'pixels'
})

function setAvatarMode(mode: AvatarMode): void {
  if (mode === avatarMode.value) return
  modePicked.value = true
  avatarMode.value = mode
  gridError.value = ''
  gridNotice.value = ''
  clearSaveFeedback()
  if (mode === 'pixels') {
    fillGridBox()
    uploadError.value = ''
    uploadNotice.value = ''
  }
}

function onGridInput(): void {
  gridTouched.value = true
  gridError.value = ''
  gridNotice.value = ''
}

/** 保存点阵：借后端令牌鉴权由 `stores/avatars` 那条链路负责 */
async function saveGrid(): Promise<void> {
  if (gridBusy.value) return
  const parsed = parseGridInput(gridText.value)
  gridError.value = ''
  gridNotice.value = ''
  clearSaveFeedback()
  if (!parsed.ok) {
    gridError.value = parsed.reason
    return
  }
  gridBusy.value = true
  try {
    const username = await avatars.save(parsed.rows)
    gridText.value = parsed.rows.join('')
    gridTouched.value = false
    if (form.avatar_url) {
      // 图片会盖住点阵：要「切换」就得把图片拿掉，并把这件事说出来
      const updated = await updateMe({ avatar_url: '' })
      form.avatar_url = updated.avatar_url ?? ''
      baseline.avatar_url = form.avatar_url
      gridNotice.value = `已存为 ${username} 的点阵头像；同时清掉了图片头像（它本来会盖住点阵）`
    } else {
      gridNotice.value = `已存为 ${username} 的点阵头像`
    }
  } catch (err) {
    gridError.value = detailOf(err, '保存点阵头像失败')
  } finally {
    gridBusy.value = false
  }
}

/** 清掉点阵：展示会回到图片头像（如果还有）或名字那张脸 */
async function clearGrid(): Promise<void> {
  if (gridBusy.value) return
  gridError.value = ''
  gridNotice.value = ''
  clearSaveFeedback()
  gridBusy.value = true
  try {
    const username = await avatars.clear()
    fillGridBox()
    gridNotice.value = `已清掉 ${username} 的点阵头像`
  } catch (err) {
    gridError.value = detailOf(err, '清除点阵头像失败')
  } finally {
    gridBusy.value = false
  }
}

async function changePassword(): Promise<void> {
  if (pwBusy.value) return
  pwError.value = ''
  pwOk.value = ''
  clearSaveFeedback()

  if (!pw.old || !pw.next || !pw.confirm) {
    pwError.value = '请填写所有密码字段'
    return
  }
  // 两次不一致在**前端**就拦住，不发请求（旧前端口径）
  if (pw.next !== pw.confirm) {
    pwError.value = '两次输入的新密码不一致'
    return
  }
  if (pw.next.length < 6) {
    pwError.value = '新密码长度至少为 6 位'
    return
  }

  pwBusy.value = true
  try {
    await resetPassword(pw.old, pw.next)
    pw.old = ''
    pw.next = ''
    pw.confirm = ''
    pwOk.value = '密码已修改'
    playSfx('confirm')
  } catch (err) {
    pwError.value = detailOf(err, '修改密码失败，请检查当前密码是否正确。')
  } finally {
    pwBusy.value = false
    restoreShellFocus()
  }
}

onMounted(() => {
  scrollScreenTop()
  void load()
})

onUnmounted(stop)

// ── 焦点：自绘光标走「动作行」，输入框走浏览器原生焦点 ──

/**
 * 动作行。表单页的口径是**输入框用原生焦点**（Tab 在字段间走，输入框内不劫持按键），
 * 所以自绘光标只覆盖这几个「按下去会发生事情」的控件：返回 / 重试 / 选头像 / 清除头像 / 保存 / 改密码。
 * 数组现算：状态一变（读失败、头像被清掉），可聚焦的行也跟着变。
 */
type ActId = 'back' | 'retry' | 'avatar' | 'removeAvatar' | 'save' | 'password'

const acts = computed<ActId[]>(() => {
  if (state.value === 'error') return ['back', 'retry']
  if (state.value !== 'ready') return ['back']
  const list: ActId[] = ['back', 'avatar']
  if (form.avatar_url) list.push('removeAvatar')
  list.push('save', 'password')
  return list
})

const focus = useFocusGroup()

/** 行数变少时把光标夹回范围内，否则会指到不存在的项上（`isFocused` 全假、回车没反应） */
watch(acts, (list) => {
  if (list.length === 0) return
  if (focus.index.value >= list.length) focus.set(list.length - 1, true)
})

function currentAct(): ActId | undefined {
  return acts.value[focus.index.value]
}

function isFocused(id: ActId): boolean {
  return currentAct() === id
}

/** 鼠标划过 = 移动同一个焦点（静音），键盘与鼠标共享一份状态 */
function hoverAct(id: ActId): void {
  const i = acts.value.indexOf(id)
  if (i >= 0) focus.hover(i)
}

/** 返回上一页：历史里有上一页就回退；深链接直接打开（没有上一页）就回主页 */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/** 执行自绘光标下的那一个动作。返回 false = 这一下没被用掉，交还浏览器 / 全局 */
function runAct(id: ActId | undefined): boolean {
  if (!id) return false
  if (id === 'back') {
    back()
    return true
  }
  if (id === 'retry') {
    playSfx('confirm')
    void load()
    return true
  }
  if (id === 'avatar') {
    playSfx('confirm')
    if (avatarMode.value === 'pixels') gridEl.value?.focus()
    else fileEl.value?.click()
    return true
  }
  if (id === 'removeAvatar') {
    playSfx('confirm')
    removeAvatar()
    return true
  }
  if (id === 'save') {
    void save()
    return true
  }
  void changePassword()
  return true
}

/**
 * 规矩 ①：原生焦点在会响应回车的元素上时，这一下回车交给浏览器。
 * 表单页尤其重要 —— 输入框里回车是**原生 form 提交**（本页两个 `<form>` 都接了 submit），
 * 抢过来就等于把浏览器自己的提交路径掐死。
 */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

/** 规矩 ②：把原生焦点收回外壳根节点（**不是** `blur()` 到 body，理由见文件头） */
function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  focusShellRoot()
}

/**
 * 提交按钮在请求期间会 `:disabled`，而浏览器会因此**把已经落在它身上的焦点丢掉**
 * （实测掉回 `body`）—— 焦点在 body 上时键盘事件不再冒泡到外壳，键盘当场失灵，
 * 与 §21 记下的那条 bug 是同一根链条，只是入口变成了「按钮变灰」。
 * 所以每次提交收尾都补一句：**只有**焦点确实掉在 body / 文档根上时才拉回外壳，
 * 绝不抢走输入框里的焦点（用户已经在下一个字段里打字时不该被打断）。
 */
function restoreShellFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body && el !== document.documentElement) return
  focusShellRoot()
}

/**
 * 文件输入框的松手（本页唯一要特判的控件）。
 * `isEditableTarget()` 认 `INPUT`，焦点停在它身上时 Q / P / 方向键全被它吃掉，
 * 键盘看起来就是「死了」。它真正需要的只有 Tab / Enter / Space / ESC ——
 * 其余按键 `preventDefault()` 后把焦点交还外壳，键盘当场恢复。
 * 不用 `blur()`：焦点掉到 body 会让外壳的监听器再也收不到按键（§21）。
 */
function onFileKey(event: KeyboardEvent): void {
  const k = event.key
  if (k === 'Tab' || k === 'Enter' || k === ' ' || k === 'Escape') return
  event.preventDefault()
  focusShellRoot()
}

/** 鼠标划过文件框：只把被**它自己**扣住的焦点交还外壳，不去抢别的输入框里的焦点 */
function releaseFileFocus(): void {
  if (document.activeElement === fileEl.value) dropNativeFocus()
}

/* ══════════════ 长文本编辑（文档型文本框才配） ══════════════ */

/**
 * 这一页只有「简介」是文档型的（要写一两句甚至几百字）。用户口径：
 * 名称 / 邮箱这类单行框不需要这个功能，所以它们连图标都不加。
 */
const { editing, openLongText, closeLongText } = useLongText()

function openBioLong(): void {
  playSfx('confirm')
  openLongText({
    key: 'bio',
    label: '简介',
    value: form.bio,
    maxlength: BIO_MAX,
    placeholder: '一两句话介绍自己（≤500 字）',
    focusId: 'profile-bio',
  })
}

/** F2 = 编辑这一格的全文（内核 `KEYMAP` 里没有 F2，不会被外壳吃掉） */
function onBioKey(event: KeyboardEvent): void {
  if (event.key !== 'F2') return
  event.preventDefault()
  openBioLong()
}

/** 弹窗保存：写回简介并清掉旧的「已保存」反馈（与手输同一口径） */
function onLongSave(value: string): void {
  closeLongText()
  form.bio = value
  clearSaveFeedback()
}

/**
 * 弹窗开着时的按键归属（写法与 `AdminLinksView` 的 `dialogPad` 同源）。
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
  // 长文本弹窗开着时，页面层把按键交给它先处理。
  // 守卫必须写在**自己**这个监听器里：外壳的 `runPass` 会遍历全部同作用域监听器、不提前退出，
  // 少这一句，弹窗里按方向键会被下面的分支把焦点收回外壳，框里的键盘当场失灵。
  if (editing.value) return longTextPad(a)

  // Q：全站的历史后退键。显式接管只为补一个兜底 —— 深链接进来没有上一页时回主页，
  // 否则键盘用户会卡死在这一页（`canGoBack` / `goBack` / `goTab` 都是 nav.ts 现成的能力）
  if (a === 'back') {
    back()
    return true
  }

  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    return runAct(currentAct())
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 规矩 ②：方向键一动就收掉原生焦点，屏幕上永远只有一个光标
    dropNativeFocus()
    // 单列排版：←→ 没有相邻项，把按键还给浏览器（滚动 / 光标移动）
    if (a !== 'up' && a !== 'down') return false
    const next = focus.index.value + (a === 'down' ? 1 : -1)
    if (next < 0 || next >= acts.value.length) return false
    focus.set(next)
    return true
  }

  // TAB 不消费：表单页靠浏览器原生 Tab 在字段间走（这一页没有标签栏，外壳也把 Tab 让给浏览器）
  // ESC 不消费：全站口径是它呼出菜单，页面里抢走 ESC 就等于把菜单入口堵死
  return false
})
onUnmounted(off)
</script>

<template>
  <div class="profile">
    <SceneHead title="个人信息 · PROFILE" :clock="clock">
      <span v-if="user" class="head-handle px">@{{ user.username }}</span>
      <!-- 返回：鼠标能点、键盘 Q。真实 <button> 也能被 Tab 走到并原生回车激活 -->
      <button
        class="back focusable mini"
        data-testid="profile-back"
        type="button"
        :class="{ 'is-focused': isFocused('back') }"
        @mouseenter="hoverAct('back')"
        @click="back"
      >
        ◀ 返回 (Q)
      </button>
    </SceneHead>

    <!-- 这一页自带标题：外壳的 SELF_TITLED_SCENES 含 profile，不会再发隐藏 h1 -->
    <h1 class="page-title">个人信息编辑</h1>
    <p class="page-lead hint">
      这里改的是后端记着的账号资料；头像与其余字段都要点「保存资料」才生效。
    </p>

    <!-- 状态一：读取中 -->
    <div v-if="state === 'loading'" class="state px" data-testid="profile-loading">
      <span class="blink" aria-hidden="true">▌</span> 读取账号信息 …
    </div>

    <!-- 状态二：令牌无效（fetchMe 401）—— 守卫之外的兜底，给一条人话 -->
    <div v-else-if="state === 'guest'" class="state" data-testid="profile-guest">
      <p class="state-title">账号信息读不出来：登录状态已经失效。</p>
      <p class="state-hint hint">
        令牌过期或被撤销时就会这样；刷新一次仍然如此，就用 P / ESC 打开菜单、在账号那一行重新登录。
      </p>
    </div>

    <!-- 状态三：其它失败 —— 后端 detail 原文摆出来，不吞异常 -->
    <div v-else-if="state === 'error'" class="state" data-testid="profile-error">
      <p class="state-title">账号信息读取失败。</p>
      <p class="err" data-testid="profile-error-detail">✕ {{ loadError }}</p>
      <button
        class="btn focusable mini"
        data-testid="profile-retry"
        type="button"
        :class="{ 'is-focused': isFocused('retry') }"
        @mouseenter="hoverAct('retry')"
        @click="load"
      >
        重试
      </button>
    </div>

    <!-- 状态四：ready —— 两个小节（h1 → h2，层级不跳级） -->
    <!--
      `novalidate`：字段该由**后端**裁决，它的 `detail` 要能原样出现在页面上（§23.3）。
      留着浏览器自带的约束校验的话，一个非法邮箱会被原生气泡拦在提交之前，
      用户永远看不到后端说的话，e2e 也打不出 422 这一条路。
      Enter 在输入框里仍然是浏览器自己的隐式提交（本页只接 `<form>` 的 submit 事件）。
    -->
    <form v-else class="sec" data-testid="profile-form" novalidate @submit.prevent="save">
      <h2 class="sec-title">基本资料</h2>

      <!-- 用户名不可改：旧前端拿 disabled 输入框当只读展示，这里直接给文字 -->
      <div class="field">
        <span class="field-cap">用户名</span>
        <span class="ro" data-testid="profile-username">@{{ user?.username }}</span>
        <span class="hint">用户名不可修改</span>
      </div>

      <!--
        头像：两栏 —— 图片（后端 `avatar_url`）/ 点阵（icespark 自己的 `/avatar`，架构 §67）。
        左边那张预览永远是**当前生效**的那张：图片 → 点阵 → 名字哈希，优先级只写在 PixelAvatar 里。
      -->
      <div class="field" data-testid="profile-avatar-field">
        <span class="field-cap">头像</span>
        <div class="avatar-row">
          <PixelAvatar
            class="avatar-pv"
            aria-hidden="true"
            data-testid="profile-avatar-canvas"
            :src="avatarMode === 'pixels' ? null : form.avatar_url || null"
            :rows="avatarMode === 'pixels' ? gridPreview : myRows"
            :name="user?.username || 'account'"
            :size="16"
            :display="64"
            :palette="AVATAR_PALETTE"
          />
          <div class="avatar-ops">
            <!-- 切换键：两个小键，当前那个按成实底（`aria-pressed` 给屏幕阅读器） -->
            <div class="av-mode" role="group" aria-label="头像来源">
              <button
                type="button"
                class="btn av-mode-btn focusable mini"
                data-testid="avatar-mode-photo"
                :aria-pressed="avatarMode === 'photo'"
                :class="{ 'is-on': avatarMode === 'photo' }"
                @click="setAvatarMode('photo')"
              >
                图片头像
              </button>
              <button
                type="button"
                class="btn av-mode-btn focusable mini"
                data-testid="avatar-mode-pixels"
                :aria-pressed="avatarMode === 'pixels'"
                :class="{ 'is-on': avatarMode === 'pixels' }"
                @click="setAvatarMode('pixels')"
              >
                点阵头像
              </button>
            </div>

            <!-- 图片这一栏：沿用原来的文件框与清除，一个字没改 -->
            <template v-if="avatarMode === 'photo'">
              <input
                id="profile-avatar-file"
                ref="fileEl"
                class="file"
                data-testid="profile-avatar-file"
                type="file"
                accept="image/*"
                aria-label="选择头像图片"
                @change="onAvatarChange"
                @keydown="onFileKey"
                @mouseenter="releaseFileFocus"
              />
              <button
                v-if="form.avatar_url"
                class="btn ghost focusable mini"
                data-testid="profile-avatar-remove"
                type="button"
                :class="{ 'is-focused': isFocused('removeAvatar') }"
                @mouseenter="hoverAct('removeAvatar')"
                @click="removeAvatar"
              >
                清除头像
              </button>
              <p class="hint">只能图片（JPG / PNG），≤ 5MB；上传后还要点「保存资料」才写进账号。</p>
              <p v-if="myRows" class="hint" data-testid="avatar-photo-shadow-hint">
                你还有一张点阵头像；图片拿掉之后它才会显示。
              </p>
              <p v-if="uploading" class="status px" data-testid="profile-avatar-uploading">
                <span class="blink" aria-hidden="true">▌</span> 头像上传中 …
              </p>
              <p v-else-if="uploadError" class="err" data-testid="profile-avatar-error">
                ✕ {{ uploadError }}
              </p>
              <p v-else-if="uploadNotice" class="ok" data-testid="profile-avatar-ok">
                ✔ {{ uploadNotice }}
              </p>
            </template>

            <!-- 点阵这一栏：预览 + 字符串 + 保存 / 清除 -->
            <template v-else>
              <p v-if="!gridAvailable" class="hint" data-testid="avatar-grid-unavailable">
                这台部署没有点阵头像服务（{{ avatars.error || '取不到 /avatar' }}）。
                它由 icespark 自己的服务器提供；只用静态托管 dist 的部署里不存在这一条路由。
              </p>
              <template v-else>
                <!-- 字符串一行装完（256 个字）：左边那张预览就在跟着它变，所以这里不再放第二个预览 -->
                <input
                  id="profile-avatar-grid"
                  ref="gridEl"
                  v-model="gridText"
                  class="input av-text"
                  data-testid="avatar-grid-text"
                  type="text"
                  name="avatar_grid"
                  spellcheck="false"
                  autocomplete="off"
                  :aria-label="`点阵头像字符串：${GRID_TOTAL} 个 0-7 的字符`"
                  @input="onGridInput"
                />
                <p class="hint">
                  {{ GRID_TOTAL }} 个字（每 <code>{{ GRID_COLS }}</code> 个一行，共
                  <code>{{ GRID_ROWS }}</code> 行），字符是调色板下标 <code>0-7</code>（<code>0</code>
                  是白底）；带换行 / 空格 / 逗号地粘进来也认。
                </p>
                <p
                  v-if="gridTouched && !gridParse.ok"
                  class="err"
                  data-testid="avatar-grid-invalid"
                >
                  ✕ {{ gridParse.reason }}
                </p>
                <p v-if="gridError" class="err" data-testid="avatar-grid-error">✕ {{ gridError }}</p>
                <p v-else-if="gridNotice" class="ok" data-testid="avatar-grid-ok">✔ {{ gridNotice }}</p>
                <div class="av-acts">
                  <button
                    type="button"
                    class="btn focusable mini"
                    data-testid="avatar-grid-save"
                    :disabled="gridBusy || !gridParse.ok"
                    @click="saveGrid"
                  >
                    保存点阵头像
                  </button>
                  <button
                    v-if="myRows"
                    type="button"
                    class="btn ghost focusable mini"
                    data-testid="avatar-grid-clear"
                    :disabled="gridBusy"
                    @click="clearGrid"
                  >
                    清除点阵头像
                  </button>
                </div>
                <p v-if="form.avatar_url" class="hint" data-testid="avatar-grid-shadow-hint">
                  你还有一张图片头像，它会盖住点阵：保存点阵时会一并清掉它。
                </p>
              </template>
            </template>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="field-cap" for="profile-display-name">昵称</label>
        <input
          id="profile-display-name"
          v-model="form.display_name"
          class="input"
          data-testid="profile-display-name"
          type="text"
          name="display_name"
          :maxlength="NAME_MAX"
          autocomplete="nickname"
          @input="clearSaveFeedback"
        />
        <span class="count px">{{ form.display_name.length }}/{{ NAME_MAX }}</span>
      </div>

      <div class="field">
        <label class="field-cap" for="profile-email">邮箱</label>
        <input
          id="profile-email"
          v-model="form.email"
          class="input"
          data-testid="profile-email"
          type="email"
          name="email"
          autocomplete="email"
          placeholder="you@example.com"
          @input="clearSaveFeedback"
        />
      </div>

      <div class="field">
        <label class="field-cap" for="profile-bio">简介</label>
        <!-- 图标就摆在这一格的框里（右上角）：它是这一格的属性，不是行尾的另一个按钮 -->
        <div class="area-wrap">
          <textarea
            id="profile-bio"
            v-model="form.bio"
            class="input textarea"
            data-testid="profile-bio"
            name="bio"
            rows="4"
            :maxlength="BIO_MAX"
            placeholder="一两句话介绍自己（≤500 字）"
            @input="clearSaveFeedback"
            @keydown="onBioKey"
          ></textarea>
          <button
            class="expand"
            data-testid="profile-bio-expand"
            type="button"
            aria-label="编辑全文：简介"
            title="编辑全文（F2）"
            @click="openBioLong"
          >
            <ExpandGlyph />
          </button>
        </div>
        <span class="count px">{{ form.bio.length }}/{{ BIO_MAX }}</span>
      </div>

      <div class="act-row">
        <button
          class="btn focusable"
          data-testid="profile-save"
          type="submit"
          :disabled="saveState === 'saving'"
          :class="{ 'is-focused': isFocused('save') }"
          @mouseenter="hoverAct('save')"
        >
          {{ saveState === 'saving' ? '保存中…' : '保存资料' }}
        </button>
        <p v-if="saveState === 'saving'" class="status px" data-testid="profile-saving">
          <span class="blink" aria-hidden="true">▌</span> 提交给后端 …
        </p>
        <p v-else-if="saveState === 'saved'" class="ok" data-testid="profile-saved">
          ✔ {{ saveMessage }}
        </p>
        <p v-else-if="saveState === 'error'" class="err" data-testid="profile-save-error">
          ✕ {{ saveMessage }}
        </p>
      </div>
    </form>

    <!-- 改密码：页面里的一个小节，不是新路由（用户裁定）。参数走 query string -->
    <form
      v-if="state === 'ready'"
      class="sec"
      data-testid="profile-password"
      novalidate
      @submit.prevent="changePassword"
    >
      <h2 class="sec-title">修改密码</h2>
      <p class="hint">
        接口是 POST /api/auth/password/reset，参数走 query
        string；两次新密码不一致会在这里先被拦下，不发给后端。
      </p>

      <div class="field">
        <label class="field-cap" for="profile-pw-old">当前密码</label>
        <input
          id="profile-pw-old"
          v-model="pw.old"
          class="input"
          data-testid="profile-pw-old"
          type="password"
          name="old_password"
          autocomplete="current-password"
        />
      </div>

      <div class="field">
        <label class="field-cap" for="profile-pw-new">新密码</label>
        <input
          id="profile-pw-new"
          v-model="pw.next"
          class="input"
          data-testid="profile-pw-new"
          type="password"
          name="new_password"
          autocomplete="new-password"
        />
      </div>

      <div class="field">
        <label class="field-cap" for="profile-pw-confirm">再输一次</label>
        <input
          id="profile-pw-confirm"
          v-model="pw.confirm"
          class="input"
          data-testid="profile-pw-confirm"
          type="password"
          name="confirm_password"
          autocomplete="new-password"
        />
      </div>

      <div class="act-row">
        <button
          class="btn focusable"
          data-testid="profile-pw-submit"
          type="submit"
          :disabled="pwBusy"
          :class="{ 'is-focused': isFocused('password') }"
          @mouseenter="hoverAct('password')"
        >
          {{ pwBusy ? '提交中…' : '修改密码' }}
        </button>
        <p v-if="pwError" class="err" data-testid="profile-pw-error">✕ {{ pwError }}</p>
        <p v-else-if="pwOk" class="ok" data-testid="profile-pw-ok">✔ {{ pwOk }}</p>
      </div>
    </form>

    <div class="foot sticky-foot px hint">
      TAB 在字段间走 · ENTER 原生提交 / 激活 · F2 编辑全文 · ↑↓ 选动作 · Q 返回 · P / ESC 菜单
    </div>

    <!-- 长文本编辑：页内模态，一次只开一个（`editing` 非空就是开着）。
         遮罩点击不关闭是有意的 —— 框里可能是几百字，一次误点不该丢 -->
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
.profile {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 26px 16px;
}

.head-handle {
  color: var(--blue-600);
}

/* 页头那个返回按钮：与用户档案页同一个按钮语言（硬边、直角） */
.back {
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

.page-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: clamp(22px, 2.6vw, 32px);
  line-height: 1.3;
  margin: 4px 0 0;
  color: var(--ink);
}

.page-lead {
  margin: 0;
}

/* ── 小节（h2 + 字段） ── */
.sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 12px 14px 14px;
}

.sec-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.4;
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--blue-200);
  color: var(--blue-700);
}

.field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.field-cap {
  flex: 0 0 78px;
  padding-top: 8px;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  color: var(--ink-soft);
}

.ro {
  padding-top: 8px;
  color: var(--blue-700);
}

.count {
  flex: 0 0 auto;
  padding-top: 8px;
  color: var(--ink-faint);
}

/*
 * 文档型文本框的包装：图标要**贴在这一格的框里**（右上角），所以需要一层定位上下文。
 * 图标不加 `.focusable`（那是外壳自绘光标那一套），走浏览器原生 Tab 顺序。
 */
.area-wrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

/* 给图标让出右上角，免得第一行文字压到它下面 */
.area-wrap .input {
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

/* 输入框焦点：描边 + 浅蓝底，用插入光标当指示（与 LoginDialog 同一套；不叠闪烁方块） */
.input {
  flex: 1 1 auto;
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

.textarea {
  min-height: 92px;
  resize: vertical;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13.5px;
  line-height: 1.8;
}

/* ── 头像 ── */
.avatar-row {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.avatar-pv {
  flex: 0 0 auto;
}

.avatar-ops {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file {
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 4px 6px;
  max-width: 100%;
}

.file:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.file::file-selector-button {
  font: inherit;
  margin-right: 8px;
  padding: 3px 8px;
  background: var(--blue-200);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  cursor: pointer;
}

.avatar-ops .hint {
  margin: 0;
}

/* ── 头像两栏：图片 / 点阵（架构 §67） ────────────────────── */

/* 切换键：两个紧挨的小键，当前那个是实底（与全站的「按下 = 实底」一致） */
.av-mode {
  display: flex;
  gap: 0;
  align-self: flex-start;
}
.av-mode-btn + .av-mode-btn {
  margin-left: -2px; /* 两个键贴在一起，像一组 */
}
/**
 * 「小的切换键」：比页面里那些动作键矮一档，像一枚开关而不是一颗按钮。
 *
 * 选择器必须带上 `.avatar-ops`：本文件自己有一条 `.btn`（等于同分），
 * 而它在这个文件里**排在我后面** —— 同等特异度下后来者赢，所以光写 `.av-mode-btn`
 * 是压不住它的（实测高度还是 46px）。
 */
.avatar-ops .av-mode-btn {
  padding: 1px 8px;
  line-height: 20px;
}
.av-mode-btn.is-on {
  background: var(--blue-500);
  color: var(--paper);
}

/* 点阵字符串：一行装完 256 个字，用等宽体（它就是那张图本身） */
.av-text {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.5px;
}
.av-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* 提示里的 `0-7` / `0` 是码表下标，用等宽体标出来 */
.avatar-ops .hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--blue-100);
  border: 1px solid var(--blue-300);
  padding: 0 3px;
}

/* ── 动作行 + 反馈 ── */
.act-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  font: inherit;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--blue-700);
  padding: 8px 16px;
  cursor: pointer;
}

.btn.ghost {
  padding: 4px 10px;
  color: var(--ink-soft);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.err {
  margin: 0;
  padding: 7px 10px;
  background: var(--blue-100);
  border-left: 8px solid var(--spark);
  color: var(--spark);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
  line-height: 1.7;
}

.ok {
  margin: 0;
  padding: 7px 10px;
  background: var(--blue-100);
  border-left: 8px solid var(--blue-500);
  color: var(--blue-700);
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 12.5px;
}

.status {
  margin: 0;
  color: var(--blue-600);
}

/* ── 读取失败 / 未登录两种空态：页内空态，不是整页 404 ── */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  border: 3px dashed var(--blue-400);
  color: var(--ink);
  padding: 18px;
  text-align: center;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
}

.state-hint {
  margin: 0;
  max-width: 62ch;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.9;
}

.foot {
  margin-top: auto;
  border-top: 2px solid var(--blue-200);
  padding-top: 8px;
}

@media (max-width: 760px) {
  .field {
    flex-wrap: wrap;
  }

  .field-cap {
    flex: 0 0 100%;
    padding-top: 0;
  }

  .avatar-row {
    flex-direction: column;
  }

}
</style>
