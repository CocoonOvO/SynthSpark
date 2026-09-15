/**
 * 认证状态管理
 * 老大让我写认证store，我就写 (╯°□°）╯
 * 虽然还没对接后端，但先把架子搭好
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

// 用户信息类型 - 与后端 User 模型保持一致
export interface User {
  id: string
  username: string
  email: string | null
  display_name?: string
  avatar_url?: string
  bio?: string
  user_type: 'user' | 'agent'
  is_active: boolean
  is_superuser: boolean
  created_at: string
  updated_at?: string
  agent_model?: string
  agent_provider?: string
  agent_config?: Record<string, any>
}

// 本地存储键名
const TOKEN_STORAGE_KEY = 'synthspark-token'
const USER_STORAGE_KEY = 'synthspark-user'

export const useAuthStore = defineStore('auth', () => {
  // Token
  const token = ref<string | null>(null)
  
  // 用户信息
  const user = ref<User | null>(null)
  
  // 加载状态
  const isLoading = ref(false)

  // 是否已登录
  const isLoggedIn = computed(() => !!token.value && !!user.value)
  
  // 是否管理员
  const isAdmin = computed(() => user.value?.is_superuser === true)

  // 检查token是否过期
  const isTokenExpired = (tokenStr: string): boolean => {
    try {
      const base64Url = tokenStr.split('.')[1]
      if (!base64Url) return true
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      }).join(''))
      const payload = JSON.parse(jsonPayload)
      return payload.exp * 1000 < Date.now()
    } catch {
      return true
    }
  }

  // 初始化（从本地存储恢复）
  const initAuth = () => {
    if (typeof window === 'undefined') return
    
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY)
    const storedUser = localStorage.getItem(USER_STORAGE_KEY)
    
    // 如果token已过期，清除登录状态
    if (storedToken && isTokenExpired(storedToken)) {
      clearAuth()
      return
    }
    
    if (storedToken) {
      token.value = storedToken
    }
    
    if (storedUser) {
      try {
        user.value = JSON.parse(storedUser)
      } catch {
        user.value = null
      }
    }
  }

  // 设置认证信息
  const setAuth = (newToken: string, newUser: User) => {
    token.value = newToken
    user.value = newUser
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken)
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser))
    }
  }

  // 清除认证信息
  const clearAuth = () => {
    token.value = null
    user.value = null
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(USER_STORAGE_KEY)
    }
  }

  // 登录（模拟）
  const login = async (username: string, _password: string): Promise<boolean> => {
    isLoading.value = true
    
    try {
      // TODO: 对接后端登录API
      // const response = await api.post('/auth/login', { username, password })
      
      // 模拟登录成功
      const mockUser: User = {
        id: '1',
        username,
        email: `${username}@example.com`,
        user_type: 'user',
        is_active: true,
        is_superuser: false,
        created_at: new Date().toISOString()
      }
      
      setAuth('mock-token-' + Date.now(), mockUser)
      return true
    } catch (error) {
      console.error('登录失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 注册（模拟）
  const register = async (username: string, email: string, _password: string): Promise<boolean> => {
    isLoading.value = true
    
    try {
      // TODO: 对接后端注册API
      // const response = await api.post('/auth/register', { username, email, password })
      
      // 模拟注册成功
      const mockUser: User = {
        id: '1',
        username,
        email,
        user_type: 'user',
        is_active: true,
        is_superuser: false,
        created_at: new Date().toISOString()
      }
      
      setAuth('mock-token-' + Date.now(), mockUser)
      return true
    } catch (error) {
      console.error('注册失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 登出
  const logout = () => {
    clearAuth()
  }

  // 更新用户信息
  const updateUser = (updates: Partial<User>) => {
    if (user.value) {
      // 创建新的用户对象
      const newUser = { ...user.value }
      
      // 处理更新：undefined 值会删除该字段，其他值正常更新
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) {
          delete (newUser as any)[key]
        } else {
          (newUser as any)[key] = value
        }
      })
      
      user.value = newUser
      
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user.value))
      }
    }
  }

  return {
    token,
    user,
    isLoading,
    isLoggedIn,
    isAdmin,
    initAuth,
    setAuth,
    clearAuth,
    login,
    register,
    logout,
    updateUser
  }
})
