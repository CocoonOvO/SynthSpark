/**
 * UI-001 登录页交互测试
 * 测试用例: LOGIN-001 ~ LOGIN-008
 */
import { test, expect } from '@playwright/test'

// 测试数据
const TEST_USER = {
  username: 'testuser123',
  password: 'testpass123'
}

const INVALID_USER = {
  username: 'testuser123',
  password: 'wrongpassword'
}

test.describe('UI-001 登录页交互测试', () => {
  
  test.beforeEach(async ({ page }) => {
    // 每个测试前清除登录状态并访问登录页
    await page.context().clearCookies()
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.removeItem('synthspark-token')
      localStorage.removeItem('synthspark-user')
    })
  })

  /**
   * LOGIN-001: 页面加载
   */
  test('LOGIN-001: 页面正常加载', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/登录|SynthSpark/)
    
    // 验证Logo显示
    await expect(page.locator('.logo')).toBeVisible()
    await expect(page.locator('.brand-name')).toHaveText('SynthSpark')
    await expect(page.locator('.brand-tagline')).toHaveText('人机共创的写作空间')
    
    // 验证表单元素
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText('登录')
    
    // 验证粒子背景
    const particles = page.locator('.particle')
    await expect(particles).toHaveCount(30)
  })

  /**
   * LOGIN-002: 正常登录
   */
  test('LOGIN-002: 正常登录流程', async ({ page }) => {
    // 填写登录表单
    await page.fill('input[type="text"]', TEST_USER.username)
    await page.fill('input[type="password"]', TEST_USER.password)
    
    // 点击登录按钮
    await page.click('button[type="submit"]')
    
    // 验证跳转到首页（增加超时时间）
    await expect(page).toHaveURL('/', { timeout: 10000 })
    
    // 验证token已保存
    const token = await page.evaluate(() => localStorage.getItem('synthspark-token'))
    expect(token).toBeTruthy()
  })

  /**
   * LOGIN-003: 登录失败-错误密码
   */
  test('LOGIN-003: 登录失败显示错误提示', async ({ page }) => {
    // 设置dialog处理器（在操作前设置）
    const dialogPromise = page.waitForEvent('dialog')
    
    // 填写错误的登录信息
    await page.fill('input[type="text"]', INVALID_USER.username)
    await page.fill('input[type="password"]', INVALID_USER.password)
    
    // 点击登录按钮
    await page.click('button[type="submit"]')
    
    // 等待并处理dialog
    const dialog = await dialogPromise
    // 实际错误提示是"用户名或密码错误"
    expect(dialog.message()).toContain('用户名或密码错误')
    await dialog.accept()
    
    // 验证停留在登录页
    await expect(page).toHaveURL('/login')
  })

  /**
   * LOGIN-004: 表单验证-空用户名
   * 注意：HTML5的required属性会阻止表单提交
   */
  test('LOGIN-004: 空用户名验证', async ({ page }) => {
    // 只填写密码
    await page.fill('input[type="password"]', TEST_USER.password)
    
    // 清空用户名
    await page.fill('input[type="text"]', '')
    
    // 点击登录按钮
    await page.click('button[type="submit"]')
    
    // HTML5验证会阻止提交，页面不会跳转
    // 验证仍然停留在登录页
    await expect(page).toHaveURL('/login')
    
    // 验证输入框有required属性
    const usernameInput = page.locator('input[type="text"]')
    await expect(usernameInput).toHaveAttribute('required', '')
  })

  /**
   * LOGIN-005: 表单验证-空密码
   * 注意：HTML5的required属性会阻止表单提交
   */
  test('LOGIN-005: 空密码验证', async ({ page }) => {
    // 只填写用户名
    await page.fill('input[type="text"]', TEST_USER.username)
    
    // 清空密码
    await page.fill('input[type="password"]', '')
    
    // 点击登录按钮
    await page.click('button[type="submit"]')
    
    // HTML5验证会阻止提交，页面不会跳转
    // 验证仍然停留在登录页
    await expect(page).toHaveURL('/login')
    
    // 验证输入框有required属性
    const passwordInput = page.locator('input[type="password"]')
    await expect(passwordInput).toHaveAttribute('required', '')
  })

  /**
   * LOGIN-006: 粒子背景效果
   */
  test('LOGIN-006: 粒子背景效果', async ({ page }) => {
    // 验证粒子容器存在
    await expect(page.locator('.particles')).toBeVisible()
    
    // 验证30个粒子
    const particles = page.locator('.particle')
    await expect(particles).toHaveCount(30)
    
    // 验证每个粒子都有样式（位置、动画延迟、动画时长）
    for (let i = 0; i < 30; i++) {
      const particle = particles.nth(i)
      const left = await particle.evaluate(el => (el as HTMLElement).style.left)
      const top = await particle.evaluate(el => (el as HTMLElement).style.top)
      expect(left).toMatch(/\d+%/)
      expect(top).toMatch(/\d+%/)
    }
  })

  /**
   * LOGIN-007: 涟漪按钮效果
   */
  test('LOGIN-007: 涟漪按钮效果', async ({ page }) => {
    const button = page.locator('.login-btn')
    
    // 验证按钮存在
    await expect(button).toBeVisible()
    
    // 鼠标移动到按钮上
    await button.hover()
    
    // 验证按钮样式变化（CSS变量更新）
    const buttonStyles = await button.evaluate(el => {
      const styles = window.getComputedStyle(el)
      return {
        position: styles.position,
        overflow: styles.overflow
      }
    })
    
    // 按钮应该有相对定位和溢出隐藏（用于涟漪效果）
    expect(buttonStyles.position).toBe('relative')
    expect(buttonStyles.overflow).toBe('hidden')
  })

  /**
   * LOGIN-008: 加载状态
   */
  test('LOGIN-008: 登录加载状态', async ({ page }) => {
    // 填写表单
    await page.fill('input[type="text"]', TEST_USER.username)
    await page.fill('input[type="password"]', TEST_USER.password)
    
    // 点击登录按钮
    await page.click('button[type="submit"]')
    
    // 验证按钮显示加载状态
    const button = page.locator('.login-btn')
    await expect(button).toHaveClass(/loading/)
    await expect(button).toHaveText('登录中...')
    
    // 等待登录完成（增加超时时间）
    await page.waitForURL('/', { timeout: 10000 })
  })
})
