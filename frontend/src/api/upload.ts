/**
 * 文件上传相关 API
 * 上传文件，又要处理进度条又要处理错误 (╯°□°）╯
 */
import { API_BASE_URL } from './client'

// 上传响应
export interface UploadResponse {
  url: string
  filename: string
  original_name: string
  size: number
  mime_type: string
}

// 上传进度回调
export type UploadProgressCallback = (progress: number) => void

// 通用上传函数
async function uploadWithProgress(
  url: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const token = typeof window !== 'undefined' ? localStorage.getItem('synthspark-token') : null

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // 进度监听
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)
          onProgress(progress)
        }
      })
    }

    // 完成监听
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response)
        } catch {
          reject(new Error('解析响应失败'))
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          reject(new Error(error.detail || `上传失败: ${xhr.status}`))
        } catch {
          reject(new Error(`上传失败: ${xhr.status}`))
        }
      }
    })

    // 错误监听
    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，上传失败'))
    })

    xhr.open('POST', url)
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    xhr.send(formData)
  })
}

/**
 * 上传 API
 */
export const uploadApi = {
  /**
   * 上传图片
   * POST /api/upload/image
   * @param file 图片文件
   * @param onProgress 进度回调
   */
  uploadImage: async (
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResponse> => {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      throw new Error('只能上传图片文件')
    }

    // 检查文件大小（10MB）
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('图片大小不能超过10MB')
    }

    return uploadWithProgress(`${API_BASE_URL}/api/upload/image`, file, onProgress)
  },

  /**
   * 上传头像
   * POST /api/upload/avatar
   * @param file 头像图片
   * @param onProgress 进度回调
   */
  uploadAvatar: async (
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResponse> => {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      throw new Error('只能上传图片文件')
    }

    // 检查文件大小（5MB）
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('头像大小不能超过5MB')
    }

    return uploadWithProgress(`${API_BASE_URL}/api/upload/avatar`, file, onProgress)
  },

  /**
   * 上传附件
   * POST /api/upload/attachment
   * @param file 附件文件
   * @param onProgress 进度回调
   */
  uploadAttachment: async (
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResponse> => {
    // 检查文件大小（50MB）
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('附件大小不能超过50MB')
    }

    return uploadWithProgress(`${API_BASE_URL}/api/upload/attachment`, file, onProgress)
  }
}
