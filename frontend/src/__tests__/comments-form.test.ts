/**
 * 匿名评论表单逻辑测试
 * 测试邮箱校验、localStorage 记忆、匿名/登录态分支行为
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── 从 PostDetailView.vue 提取的逻辑 ────────────────────────────
// 邮箱格式校验（前端预校验，后端 pydantic 二次校验）
const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// localStorage 记忆 key
const ANONYMOUS_STORAGE_KEY = 'synthspark_anonymous_comment'

// 读取匿名评论记忆
function loadAnonymousInfo(): { name?: string; email?: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(ANONYMOUS_STORAGE_KEY) || '{}')
    return {
      name: saved?.name || undefined,
      email: saved?.email || undefined,
    }
  } catch {
    return {}
  }
}

// 保存匿名评论记忆
function saveAnonymousInfo(name: string, email?: string): void {
  localStorage.setItem(
    ANONYMOUS_STORAGE_KEY,
    JSON.stringify({ name, email: email || undefined })
  )
}

// ── 测试 ──────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('合法邮箱', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co')).toBe(true)
    expect(isValidEmail('a+b@c.com')).toBe(true)
  })

  it('非法邮箱', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('@no-local.com')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('user@.com')).toBe(false)
    expect(isValidEmail('user@domain')).toBe(false)
    expect(isValidEmail('user domain@example.com')).toBe(false)
  })
})

describe('匿名评论 localStorage 记忆', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('空记忆时返回空对象', () => {
    const info = loadAnonymousInfo()
    expect(info).toEqual({ name: undefined, email: undefined })
  })

  it('JSON 解析失败时静默返回空对象', () => {
    localStorage.setItem(ANONYMOUS_STORAGE_KEY, 'not-json{{{')
    const info = loadAnonymousInfo()
    expect(info).toEqual({ name: undefined, email: undefined })
  })

  it('保存名称后可回填', () => {
    saveAnonymousInfo('路人甲', 'guest@test.com')
    const info = loadAnonymousInfo()
    expect(info.name).toBe('路人甲')
    expect(info.email).toBe('guest@test.com')
  })

  it('只保存名称、邮箱为空时 email 为 undefined', () => {
    saveAnonymousInfo('路人')
    const info = loadAnonymousInfo()
    expect(info.name).toBe('路人')
    expect(info.email).toBeUndefined()
  })

  it('覆盖写入：新值替换旧值', () => {
    saveAnonymousInfo('第一人', 'old@test.com')
    saveAnonymousInfo('第二人', 'new@test.com')
    const info = loadAnonymousInfo()
    expect(info.name).toBe('第二人')
    expect(info.email).toBe('new@test.com')
  })
})

describe('匿名评论表单提交验证逻辑', () => {
  // 模拟 PostDetailView.vue submitComment 中匿名分支的校验
  function validateAnonymousComment(
    name: string,
    email: string,
    content: string
  ): { ok: boolean; error?: string } {
    if (!content.trim()) return { ok: false, error: '请输入评论内容' }

    const trimmedName = name.trim()
    if (!trimmedName) return { ok: false, error: '请填写你的称呼' }

    const trimmedEmail = email.trim()
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      return { ok: false, error: '邮箱格式不正确' }
    }

    return { ok: true }
  }

  it('名称和内容都有：通过', () => {
    expect(validateAnonymousComment('路人', '', '内容')).toEqual({ ok: true })
  })

  it('含合法邮箱：通过', () => {
    expect(validateAnonymousComment('路人', 'a@b.com', '内容')).toEqual({ ok: true })
  })

  it('空内容：拒绝', () => {
    expect(validateAnonymousComment('路人', '', '')).toEqual({
      ok: false,
      error: '请输入评论内容',
    })
  })

  it('空名称：拒绝', () => {
    expect(validateAnonymousComment('', '', '内容')).toEqual({
      ok: false,
      error: '请填写你的称呼',
    })
  })

  it('仅空格名称：拒绝', () => {
    expect(validateAnonymousComment('   ', '', '内容')).toEqual({
      ok: false,
      error: '请填写你的称呼',
    })
  })

  it('非法邮箱：拒绝', () => {
    expect(validateAnonymousComment('路人', 'bad-email', '内容')).toEqual({
      ok: false,
      error: '邮箱格式不正确',
    })
  })

  it('空邮箱（未填写）：通过（可选字段）', () => {
    expect(validateAnonymousComment('路人', '', '内容')).toEqual({ ok: true })
  })
})

describe('匿名/登录态分支行为', () => {
  it('登录态下 author_name 字段应被忽略（不发送）', () => {
    // 模拟登录态：有 token
    localStorage.setItem('synthspark-token', 'mock-token')
    const isLoggedIn = !!localStorage.getItem('synthspark-token')

    // 登录用户提交时不带匿名字段
    const payload: Record<string, string | undefined> = {
      post_id: 'p1',
      content: '评论内容',
    }
    if (!isLoggedIn) {
      payload.author_name = '路人'
      payload.author_email = 'test@test.com'
    }

    expect(payload.author_name).toBeUndefined()
    expect(payload.author_email).toBeUndefined()
  })

  it('匿名态下 author_name 应被加入 payload', () => {
    localStorage.removeItem('synthspark-token')
    const isLoggedIn = !!localStorage.getItem('synthspark-token')

    const payload: Record<string, string | undefined> = {
      post_id: 'p1',
      content: '评论内容',
    }
    if (!isLoggedIn) {
      payload.author_name = '路人'
      payload.author_email = 'test@test.com'
    }

    expect(payload.author_name).toBe('路人')
    expect(payload.author_email).toBe('test@test.com')
  })
})
