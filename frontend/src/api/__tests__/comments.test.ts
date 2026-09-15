/**
 * 评论 API 接口测试
 * mock fetch 测试 commentsApi 各方法的请求/响应行为
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commentsApi, type CreateCommentRequest, type Comment } from '../comments'

// 全局 fetch mock
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
  // 确保无 token（模拟匿名）
  localStorage.removeItem('synthspark-token')
})

// 模拟成功响应的 fetch mock 工具
function mockSuccessResponse(data: Comment) {
  return {
    ok: true,
    status: 201,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
  }
}

function mockErrorResponse(status: number, detail: string) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({ detail }),
  }
}

describe('commentsApi.create', () => {
  const mockComment: Comment = {
    id: 123,
    post_id: 'post-456',
    author_id: null,
    author_name: '路人甲',
    content: '测试评论',
    created_at: '2026-08-10T12:00:00Z',
    replies: [],
  }

  it('匿名评论：携带 author_name 和 author_email', async () => {
    mockFetch.mockResolvedValue(mockSuccessResponse(mockComment))

    const data: CreateCommentRequest = {
      post_id: 'post-456',
      content: '测试评论',
      author_name: '路人甲',
      author_email: 'guest@example.com',
    }
    const result = await commentsApi.create(data)

    // 请求发出
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('/api/comments')
    expect(opts!.method).toBe('POST')

    // body 包含匿名字段
    const body = JSON.parse(opts!.body as string)
    expect(body.author_name).toBe('路人甲')
    expect(body.author_email).toBe('guest@example.com')
    expect(body.post_id).toBe('post-456')

    // 返回值
    expect(result.id).toBe(123)
    expect(result.author_name).toBe('路人甲')
  })

  it('登录用户：不发送 author_name 和 author_email', async () => {
    // 设置 token 模拟登录
    localStorage.setItem('synthspark-token', 'test-token-abc')

    mockFetch.mockResolvedValue(mockSuccessResponse({
      ...mockComment,
      author_id: 'user-789',
      author_name: undefined,
    }))

    await commentsApi.create({
      post_id: 'post-456',
      content: '登录用户评论',
    })

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)
    expect(body.author_name).toBeUndefined()
    expect(body.author_email).toBeUndefined()

    // 请求头包含 Authorization
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token-abc')
  })

  it('HTTP 422：抛出带 detail 的错误', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(422, '匿名评论必须填写名称'))

    await expect(
      commentsApi.create({ post_id: 'post-456', content: '无名称' })
    ).rejects.toThrow('匿名评论必须填写名称')
  })

  it('HTTP 429：限流错误正确透传', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(429, '匿名评论已达上限'))

    await expect(
      commentsApi.create({ post_id: 'post-456', content: '被限流', author_name: 'test' })
    ).rejects.toThrow('匿名评论已达上限')
  })

  it('网络错误：抛出友好提示', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      commentsApi.create({ post_id: 'post-456', content: '网络断了', author_name: 'test' })
    ).rejects.toThrow('网络连接失败')
  })
})

describe('commentsApi.getList', () => {
  it('传 post_id 查询参数', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ total: 2, comments: [] }),
    })

    await commentsApi.getList({ post_id: 'post-abc' })

    const url = mockFetch.mock.calls[0]![0]
    expect(url).toContain('post_id=post-abc')
  })
})

describe('Comment 类型定义', () => {
  it('author_id 可为 null（匿名评论）', () => {
    const anon: Comment = {
      id: 1,
      post_id: 'p1',
      content: 'c',
      created_at: '2026-01-01',
      author_id: null,
    }
    expect(anon.author_id).toBeNull()
  })

  it('author_name 可选字段', () => {
    const withName: Comment = {
      id: 1,
      post_id: 'p1',
      content: 'c',
      created_at: '2026-01-01',
      author_name: '路人',
    }
    expect(withName.author_name).toBe('路人')

    const withoutName: Comment = {
      id: 2,
      post_id: 'p1',
      content: 'c',
      created_at: '2026-01-01',
    }
    expect(withoutName.author_name).toBeUndefined()
  })
})
