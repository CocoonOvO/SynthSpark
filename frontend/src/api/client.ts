/**
 * API 基础客户端
 * 老大说要简单，我就写最简单的 (´；ω；`)
 * 虽然不想写，但还是要写好
 */

// API 基础地址 - 使用相对路径，通过反向代理访问后端
// 开发环境：vite.config.ts 的 proxy 会代理 /api 到后端
// 生产环境：nginx 需要配置反向代理 /api -> 后端服务
const API_BASE_URL = ''

// 请求配置接口
interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

// 统一响应格式
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  total?: number
}

// 构建带查询参数的URL
function buildUrl(url: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return url
  
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  })
  
  const queryString = searchParams.toString()
  return queryString ? `${url}?${queryString}` : url
}

// 获取Token
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('synthspark-token')
}

// 统一请求封装
async function request<T>(url: string, config: RequestConfig = {}): Promise<T> {
  const { params, ...fetchConfig } = config
  const fullUrl = `${API_BASE_URL}${buildUrl(url, params)}`
  
  const token = getToken()
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...((fetchConfig.method === 'POST' || fetchConfig.method === 'PUT') && {
      'Content-Type': 'application/json'
    }),
    ...(fetchConfig.headers as Record<string, string>)
  }
  
  try {
    const response = await fetch(fullUrl, {
      ...fetchConfig,
      headers
    })
    
    // 处理204 No Content
    if (response.status === 204) {
      return undefined as T
    }
    
    // 解析响应
    let data: any
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }
    
    // 处理错误
    if (!response.ok) {
      const errorMessage = data?.detail || data?.message || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }
    
    return data as T
  } catch (error) {
    // 网络错误处理
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查后端服务是否启动')
    }
    throw error
  }
}

// API 客户端
export const client = {
  get: <T>(url: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(url, { method: 'GET', params }),
  
  post: <T>(url: string, data?: any) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(data) }),
  
  put: <T>(url: string, data?: any) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(data) }),
  
  patch: <T>(url: string, data?: any) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(data) }),
  
  delete: <T>(url: string) =>
    request<T>(url, { method: 'DELETE' })
}

// 导出基础URL供其他模块使用
export { API_BASE_URL }
