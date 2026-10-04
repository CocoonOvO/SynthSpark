<script setup lang="ts">
/**
 * 登录弹窗 —— 照搬样机 `ui/LoginDialog.vue`。
 *
 * P3 收尾按用户口径改成**外壳级模态**：暂停菜单里的「登录」行会把菜单关掉再开它
 * （两个框不叠在一起，用户反馈叠着难受），所以它自带输入作用域与遮罩点击关闭。
 *
 * 走真实接口：POST /api/auth/token，**form-urlencoded**（不是 JSON）。
 * 失败时把后端的 detail 原样显示出来 —— 样机里最容易说谎的地方就是「登录成功」。
 *
 * 与样机唯一的机械改写：`login` 从模块函数变成 store action（`useAuthStore()`），
 * 返回值形状不变（`{ ok: true } | { ok: false, message }`），所以下面 `submit()` 的分支一个字没动。
 *
 * 输入等价性：
 * - 键盘：输入框内 Enter 直接提交（原生 form 行为）；Tab 在 用户名→密码→登录 之间移动；
 *   ESC 关闭。空闲时 A/Enter 提交、B/ESC 关闭由输入层兜底。
 * - 鼠标：点击输入、点击「登录」。
 * 注意：文字输入框的焦点指示用光标与描边，不叠两侧闪烁方块（否则和文字抢注意力）。
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

import { onPad } from '@/input/pad'
import { setScope } from '@/input/scopes'
import { playSfx } from '@/input/sfx'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ (e: 'close'): void; (e: 'ok', username: string): void }>()

/**
 * 框里的一句提示（P5 起）：由外壳转交，内容由请求方决定 ——
 * 目前只有路由守卫那一句「这个页面要先登录」（未登录深链接进需鉴权页时）。
 * 从菜单点进来的走的是空串，框里就还是原来那两行，不凭空多出一条。
 */
defineProps<{ notice?: string }>()

const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const userEl = ref<HTMLInputElement | null>(null)

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const r = await auth.login(username.value, password.value)
  busy.value = false
  if (r.ok) {
    playSfx('confirm')
    emit('ok', username.value.trim())
  } else {
    error.value = r.message
    password.value = ''
    await nextTick()
    userEl.value?.focus()
  }
}

/** 输入层兜底：输入框内不劫持按键（只留 ESC），这里处理的是「焦点不在输入框」的情况 */
const off = onPad((a) => {
  // ESC 关框；X / Backspace（back 动作）在这里同义，免得弹窗里按 ← 类的返回键没反应
  if (a === 'cancel' || a === 'back') {
    emit('close')
    return true
  }
  if (a === 'confirm') {
    void submit()
    return true
  }
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return true
  return false
}, 'pause')

/**
 * 输入作用域由本组件自己管（P3 收尾改）。
 *
 * 之前它嵌在暂停菜单里，跟着菜单的 `setScope('pause')` 走；现在它是**外壳级模态**
 * （`App.vue` 的 `loginOpen`），必须自己切作用域，否则背后场景会同时收到按键。
 * 做法与 `SoundPrompt.vue` 一致：挂载时切 pause、卸载时还原。
 */
const releaseScope = setScope('pause')

onMounted(() => {
  void nextTick(() => userEl.value?.focus())
})

onUnmounted(() => {
  off()
  releaseScope()
})
</script>

<!-- 带表单的模态：`data-focus-trap="cycle"` 让 Tab 在框内循环（最后一个 → 第一个），
     免得走到最后一个按钮之后焦点卡死、只剩 ESC 能脱身。判定见 `src/input/focusTrap.ts`。 -->
<template>
  <div
    class="mask"
    data-testid="login-dialog"
    role="dialog"
    aria-modal="true"
    data-focus-trap="cycle"
    aria-labelledby="login-dialog-title"
    @click.self="emit('close')"
  >
    <div class="panel px">
      <div class="panel-head">
        <span id="login-dialog-title" class="panel-title">登录</span>
        <button class="x focusable mini" data-testid="login-close" @click="emit('close')">✕</button>
      </div>

      <p class="panel-desc">
        用项目账号登录后可发表评论、编辑自己的文章。匿名访客也能评论，只是要留一个称呼。
      </p>

      <!-- 守卫送来的提示：只在有内容时出现（从菜单进来的不显示） -->
      <p v-if="notice" class="panel-notice hint" data-testid="login-notice">{{ notice }}</p>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span class="field-cap">用户名</span>
          <input
            ref="userEl"
            v-model="username"
            class="input"
            data-testid="login-username"
            type="text"
            name="username"
            autocomplete="username"
            spellcheck="false"
            placeholder="username"
          />
        </label>

        <label class="field">
          <span class="field-cap">密码</span>
          <input
            v-model="password"
            class="input"
            data-testid="login-password"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="password"
          />
        </label>

        <p v-if="error" class="err" data-testid="login-error">✕ {{ error }}</p>
        <p v-else class="tip hint">接口：POST /api/auth/token（form-urlencoded）</p>

        <div class="actions">
          <button
            class="btn focusable mini"
            data-testid="login-submit"
            type="submit"
            :disabled="busy"
          >
            {{ busy ? '登录中…' : '确认登录' }}
          </button>
          <button class="btn ghost focusable mini" type="button" @click="emit('close')">
            取消
          </button>
        </div>
      </form>

      <div class="keys hint">ENTER 提交 · TAB 换输入框 · ESC 关闭</div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 240;
  background: var(--veil-deep);
  display: grid;
  place-items: center;
  padding: 20px;
}

.panel {
  width: min(440px, 100%);
  background: var(--paper);
  border: 3px solid var(--edge);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 14px 18px 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  border-bottom: 3px solid var(--blue-300);
  padding-bottom: 8px;
}

.panel-title {
  font-size: 24px;
  color: var(--blue-600);
}

.x {
  margin-left: auto;
  font: inherit;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--ink-soft);
  padding: 2px 8px;
  cursor: pointer;
}

.panel-desc {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-soft);
  margin: 12px 0 14px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-cap {
  width: 48px;
  color: var(--ink-soft);
  flex: 0 0 auto;
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

/* 文本输入框的焦点：描边 + 浅蓝底（用插入光标当焦点指示，不再叠两侧闪烁方块） */
.input:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.err {
  margin: 0;
  padding: 7px 10px;
  background: var(--blue-100);
  border-left: 8px solid var(--spark);
  color: var(--spark);
  font-size: 12px;
}

.tip {
  margin: 0;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  flex: 1;
  font: inherit;
  background: var(--paper);
  border: 3px solid var(--blue-400);
  color: var(--blue-700);
  padding: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.ghost {
  color: var(--ink-soft);
  flex: 0 0 96px;
}

.keys {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
}
</style>
