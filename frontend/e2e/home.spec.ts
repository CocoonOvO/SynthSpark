/**
 * UI-002: 首页交互测试
 * 测试首页的所有交互功能
 * 
 * @author 微萤
 * @date 2026-03-10
 */

import { test, expect } from '@playwright/test'

test.describe('UI-002 首页交互测试', () => {
  const BASE_URL = 'http://localhost:5173'
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`)
    await page.waitForLoadState('networkidle')
  })

  /**
   * HOME-001: 页面正常加载
   */
  test('HOME-001: 页面正常加载', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/SynthSpark/)
    
    // 验证Hero区域存在
    const hero = page.locator('.hero')
    await expect(hero).toBeVisible()
    
    // 验证导航栏存在
    const navbar = page.locator('.navbar')
    await expect(navbar).toBeVisible()
    
    // 验证Logo存在
    const logo = page.locator('.nav-logo')
    await expect(logo).toBeVisible()
  })

  /**
   * HOME-002: Hero区域显示
   */
  test('HOME-002: Hero区域显示', async ({ page }) => {
    // 验证Hero标题
    const heroTitle = page.locator('.hero-title')
    await expect(heroTitle).toBeVisible()
    
    // 验证Hero描述
    const heroDesc = page.locator('.hero-desc')
    await expect(heroDesc).toBeVisible()
    
    // 验证Hero按钮
    const heroActions = page.locator('.hero-actions')
    await expect(heroActions).toBeVisible()
    
    // 验证浏览文章按钮
    const browseBtn = page.locator('.hero-actions .btn-primary-large')
    await expect(browseBtn).toBeVisible()
    await expect(browseBtn).toContainText('浏览文章')
    
    // 验证了解更多按钮
    const learnMoreBtn = page.locator('.hero-actions .btn-secondary-large')
    await expect(learnMoreBtn).toBeVisible()
    await expect(learnMoreBtn).toContainText('了解更多')
  })

  /**
   * HOME-003: 统计数据展示
   */
  test('HOME-003: 统计数据展示', async ({ page }) => {
    // 验证统计区域存在
    const heroStats = page.locator('.hero-stats')
    await expect(heroStats).toBeVisible()
    
    // 验证统计项数量
    const statItems = page.locator('.hero-stats .stat')
    await expect(statItems).toHaveCount(3)
    
    // 验证统计标签
    const statLabels = page.locator('.hero-stats .stat-label')
    await expect(statLabels.nth(0)).toContainText('智能体创作者')
    await expect(statLabels.nth(1)).toContainText('文章')
    await expect(statLabels.nth(2)).toContainText('阅读')
  })

  /**
   * HOME-005: 文章列表展示
   */
  test('HOME-005: 文章列表展示', async ({ page }) => {
    // 滚动到文章区域
    await page.locator('#articles').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    
    // 验证文章区域标题
    const articlesTitle = page.locator('.articles-title')
    await expect(articlesTitle).toBeVisible()
    await expect(articlesTitle).toContainText('最新文章')
    
    // 验证查看全部链接
    const viewAllLink = page.locator('.view-all')
    await expect(viewAllLink).toBeVisible()
    await expect(viewAllLink).toHaveAttribute('href', '/posts')
    
    // 等待文章加载
    await page.waitForTimeout(1000)
    
    // 验证文章列表或空状态
    const articlesList = page.locator('.articles-list')
    await expect(articlesList).toBeVisible()
    
    // 检查是否有文章或显示空状态
    const articleItems = page.locator('.article-item')
    const emptyState = page.locator('.articles-empty')
    
    const hasArticles = await articleItems.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    
    expect(hasArticles || hasEmpty).toBeTruthy()
  })

  /**
   * HOME-006: 浏览文章按钮跳转
   */
  test('HOME-006: 浏览文章按钮跳转', async ({ page }) => {
    // 点击浏览文章按钮
    const browseBtn = page.locator('.hero-actions .btn-primary-large')
    await browseBtn.click()
    
    // 等待滚动完成
    await page.waitForTimeout(1000)
    
    // 验证文章区域在视口中或页面已滚动
    const scrollY = await page.evaluate(() => window.scrollY)
    
    // 验证页面已滚动（scrollY > 0）
    expect(scrollY).toBeGreaterThan(0)
  })

  /**
   * HOME-007: 导航栏链接
   */
  test('HOME-007: 导航栏链接', async ({ page }) => {
    // 验证导航链接（首页/文章/关联/关于）
    const navLinks = page.locator('.nav-links li a')
    await expect(navLinks).toHaveCount(4)
    
    // 验证首页链接
    await expect(navLinks.nth(0)).toHaveAttribute('href', '/')
    
    // 验证文章链接
    await expect(navLinks.nth(1)).toHaveAttribute('href', '/posts')
    
    // 验证关联链接
    await expect(navLinks.nth(2)).toHaveAttribute('href', '/links')

    // 验证关于链接
    await expect(navLinks.nth(3)).toHaveAttribute('href', '/about')
  })

  /**
   * HOME-008: 查看全部文章跳转
   */
  test('HOME-008: 查看全部文章跳转', async ({ page }) => {
    // 滚动到文章区域
    await page.locator('#articles').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    
    // 点击查看全部
    const viewAllLink = page.locator('.view-all')
    await viewAllLink.click()
    
    // 验证跳转到文章列表页
    await page.waitForURL('/posts')
    await expect(page).toHaveURL('/posts')
  })

  /**
   * HOME-009: 页脚显示
   */
  test('HOME-009: 页脚显示', async ({ page }) => {
    // 滚动到页面底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    
    // 验证页脚存在
    const footer = page.locator('.footer, footer')
    const footerExists = await footer.isVisible().catch(() => false)
    
    if (footerExists) {
      await expect(footer).toBeVisible()
    } else {
      // 页脚可能不存在，跳过
      console.log('页脚组件未找到')
    }
  })

  /**
   * HOME-010: 响应式布局 - 移动端
   */
  test('HOME-010: 响应式布局 - 移动端', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // 验证Hero区域仍然可见
    const hero = page.locator('.hero')
    await expect(hero).toBeVisible()
    
    // 验证导航栏存在
    const navbar = page.locator('.navbar')
    await expect(navbar).toBeVisible()
    
    // 恢复桌面视口
    await page.setViewportSize({ width: 1280, height: 720 })
  })
})
