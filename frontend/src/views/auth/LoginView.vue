<template>
  <!--
    登录页 - 凌晨两点的光标，还在等待下一行代码
    老大说要粒子背景、涟漪按钮，我就写呗 (´；ω；`)
  -->
  <div class="login-view">
    <!-- 背景粒子 -->
    <div class="particles">
      <div
        v-for="n in 30"
        :key="n"
        class="particle"
        :style="{
          left: `${particlePositions[n - 1]?.left}%`,
          top: `${particlePositions[n - 1]?.top}%`,
          animationDelay: `${particlePositions[n - 1]?.delay}s`,
          animationDuration: `${particlePositions[n - 1]?.duration}s`
        }"
      ></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-container">
      <div class="login-card">
        <!-- Logo -->
        <div class="logo-section">
          <div class="logo">
            <!-- Spin Logo - 三瓣旋转 -->
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 4c2 2 3 5 2 8-1 2-3 3-4 2-2-1-2-4-1-7 1-2 2-3 3-3z" fill="currentColor" opacity="0.9"/>
              <path d="M20 14c-2 2-5 3-8 2-2-1-3-3-2-4 1-2 4-2 7-1 2 1 3 2 3 3z" fill="currentColor" opacity="0.8"/>
              <path d="M6 18c-1-3 0-6 3-7 2-1 4 0 4 2 0 2-3 4-6 5-1 0-1 0-1 0z" fill="currentColor" opacity="0.85"/>
            </svg>
          </div>
          <h1 class="brand-name">{{ siteName }}</h1>
          <p class="brand-tagline">多智能体博客系统</p>
        </div>

        <!-- 登录表单 -->
        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <div class="input-wrapper">
              <input
                v-model="form.username"
                type="text"
                class="form-input"
                placeholder="请输入用户名"
                required
              >
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">密码</label>
            <div class="input-wrapper">
              <input
                v-model="form.password"
                type="password"
                class="form-input"
                placeholder="请输入密码"
                required
              >
            </div>
          </div>

          <div class="form-options">
            <label class="checkbox-wrapper">
              <input v-model="form.rememberMe" type="checkbox">
              <span class="checkbox-custom"></span>
              <span class="checkbox-label">记住我</span>
            </label>
          </div>

          <button
            type="submit"
            class="login-btn"
            :class="{ loading: isLoading }"
            :style="buttonRippleStyle"
            @mousemove="updateRipple"
          >
            {{ isLoading ? '登录中...' : '登录' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { getSiteConfig } from '@/config/siteConfig'

// ╭────────────────────────────────────────────────────────────╮
// │  路由和状态 - 登录逻辑，又是一个不眠之夜
// ╰────────────────────────────────────────────────────────────╯
const router = useRouter()
const route = useRoute()

// 站点名（可配置，默认 SynthSpark）
const siteName = getSiteConfig().site.name
const authStore = useAuthStore()

// 表单数据
const form = reactive({
  username: '',
  password: '',
  rememberMe: true
})

// UI 状态
const isLoading = ref(false)
const buttonRippleStyle = reactive({
  '--x': '50%',
  '--y': '50%'
} as Record<string, string>)

// 粒子位置
const particlePositions = ref<Array<{ left: number; top: number; delay: number; duration: number }>>([])

// ╭────────────────────────────────────────────────────────────╮
// │  方法 - 登录处理
// ╰────────────────────────────────────────────────────────────╯

// 生成粒子位置
const generateParticles = () => {
  particlePositions.value = Array.from({ length: 30 }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 20,
    duration: 15 + Math.random() * 10
  }))
}

// 更新按钮涟漪效果
const updateRipple = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 100
  const y = ((e.clientY - rect.top) / rect.height) * 100
  buttonRippleStyle['--x'] = `${x}%`
  buttonRippleStyle['--y'] = `${y}%`
}

// 登录处理
const handleLogin = async () => {
  if (!form.username.trim() || !form.password.trim()) {
    alert('请输入用户名和密码')
    return
  }

  isLoading.value = true

  try {
    // 调用登录API
    const response = await authApi.login({
      username: form.username,
      password: form.password
    })

    // 先保存token到localStorage，这样getMe才能使用
    localStorage.setItem('synthspark-token', response.access_token)

    // 获取用户信息
    const user = await authApi.getMe()

    // 保存到 authStore
    authStore.setAuth(response.access_token, user)

    // 登录成功，跳转到原目标页面或首页
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } catch (error: any) {
    console.error('登录失败:', error)
    alert(error.message || '登录失败，请检查用户名和密码')
  } finally {
    isLoading.value = false
  }
}

// ╭────────────────────────────────────────────────────────────╮
// │  生命周期 - 初始化粒子
// ╰────────────────────────────────────────────────────────────╯
onMounted(() => {
  generateParticles()
})
</script>

<style scoped>
/* ╭────────────────────────────────────────────────────────────╮
   │  登录页样式 - 凌晨两点的光标，还在等待下一行代码
   ╰────────────────────────────────────────────────────────────╯ */
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  background: var(--bg-primary);
}

/* ╭── 背景粒子效果 ──╮ */
.particles {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: var(--accent-primary);
  border-radius: 50%;
  opacity: 0.4;
  box-shadow: 0 0 6px var(--accent-primary);
  animation: float-up 20s infinite ease-in-out;
}

@keyframes float-up {
  0% {
    transform: translateY(100vh) scale(0.5);
    opacity: 0;
  }
  10% { opacity: 0.6; }
  90% { opacity: 0.4; }
  100% {
    transform: translateY(-100vh) scale(1.2);
    opacity: 0;
  }
}

/* 极光主题：星点闪烁 */
[data-theme="aurora"] .particle {
  animation: twinkle 4s infinite ease-in-out;
  width: 2px;
  height: 2px;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.5); }
}

/* 暖阳主题：落叶飘落 */
[data-theme="sunset"] .particle {
  width: 6px;
  height: 6px;
  border-radius: 0 50% 50% 50%;
  transform: rotate(45deg);
  animation: leaf-fall 15s infinite ease-in-out;
}

@keyframes leaf-fall {
  0% {
    transform: translateY(-10vh) translateX(0) rotate(0deg);
    opacity: 0;
  }
  10% { opacity: 0.6; }
  90% { opacity: 0.4; }
  100% {
    transform: translateY(110vh) translateX(100px) rotate(360deg);
    opacity: 0;
  }
}

/* ╭── 登录卡片 ──╮ */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 0 24px;
}

.login-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  padding: 48px 40px;
  backdrop-filter: blur(20px);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.02);
  animation: card-enter 0.6s var(--transition-smooth);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ╭── Logo区域 ──╮ */
.logo-section {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 2px solid var(--accent-primary);
  border-radius: 16px;
  margin-bottom: 20px;
  position: relative;
  animation: logo-pulse 3s ease-in-out infinite;
  color: var(--accent-primary);
}

@keyframes logo-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--glow-primary); }
  50% { box-shadow: 0 0 20px 5px var(--glow-strong); }
}

.logo svg {
  width: 32px;
  height: 32px;
}

.brand-name {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-family: var(--font-display);
}

.brand-tagline {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 8px;
  letter-spacing: 0.1em;
}

/* ╭── 表单区域 ──╮ */
.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-wrapper {
  position: relative;
}

.form-input {
  width: 100%;
  padding: 14px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 15px;
  font-family: inherit;
  transition: var(--transition-fast) var(--transition-smooth);
  outline: none;
}

.form-input::placeholder {
  color: var(--text-tertiary);
}

.form-input:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.form-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--glow-primary);
}

/* ╭── 选项区域 ──╮ */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.checkbox-wrapper input {
  display: none;
}

.checkbox-custom {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-subtle);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-fast);
}

.checkbox-wrapper:hover .checkbox-custom {
  border-color: var(--accent-primary);
}

.checkbox-wrapper input:checked + .checkbox-custom {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.checkbox-custom::after {
  content: '';
  width: 5px;
  height: 9px;
  border: solid var(--bg-primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
  opacity: 0;
  transition: var(--transition-fast);
}

.checkbox-wrapper input:checked + .checkbox-custom::after {
  opacity: 1;
}

.checkbox-label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ╭── 登录按钮 ──╮ */
.login-btn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border: none;
  border-radius: 12px;
  color: var(--bg-primary);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: var(--transition-fast) var(--transition-smooth);
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px var(--glow-primary);
}

.login-btn:active {
  transform: translateY(0) scale(0.98);
}

.login-btn.loading {
  opacity: 0.8;
  cursor: not-allowed;
}

/* 涟漪效果 */
.login-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.3) 0%, transparent 60%);
  opacity: 0;
  transition: opacity 0.3s;
}

.login-btn:hover::after {
  opacity: 1;
}

/* ╭── 响应式 ──╮ */
@media (max-width: 480px) {
  .login-card {
    padding: 36px 24px;
  }

  .brand-name {
    font-size: 24px;
  }
}

/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .login-card {
    animation: none;
  }

  .logo {
    animation: none;
  }

  .particle {
    animation: none;
  }
}
</style>