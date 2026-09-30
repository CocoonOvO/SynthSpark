import { request } from './client'

/**
 * 账号接口（契约 `/api/auth/*`）。
 *
 * 这里只放页面会用到、且形状固定的那一个：**改密码**。为什么登录不在这里：
 * `POST /api/auth/token` 要的是 `application/x-www-form-urlencoded` 表单体（OAuth2 口令模式），
 * 而 `client.ts` 的 `postJson` 只会 `JSON.stringify`；登录还要顺手写令牌（`writeToken`）
 * 并刷新 `stores/auth` —— 那些副作用属于状态层，数据层不该知道。
 * 所以登录留在 `stores/auth.ts`（那里有同一件事的另一半边注释）。
 *
 * 改密码的形状与登录正相反：参数走 **query string**、body 留空 —— 参数塞进 JSON body
 * 会被后端当成缺少参数（契约 `POST /api/auth/password/reset` 的 `old_password` /
 * `new_password` 都是 query 参数）。`request()` 只在 `body` 有值时才写 `Content-Type`，
 * 正好是这个端点的形状。
 *
 * 这段原来长在 `ProfileView.vue` 里（页面直接调 `client.request()`），§24.6 记过这笔账；
 * 现在收回数据层，页面只认函数名。
 */
export async function resetPassword(oldPassword: string, newPassword: string): Promise<void> {
  await request<Record<string, unknown>>('/auth/password/reset', {
    method: 'POST',
    query: { old_password: oldPassword, new_password: newPassword },
    auth: true,
  })
}
