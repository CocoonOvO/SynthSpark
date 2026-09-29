import { ref, watch } from 'vue'

/**
 * 用户偏好：音效 / 每页条数 / 动效。
 *
 * 存储键一律 `synthspark-icespark-*`（AGENTS.md 第 1 节：前端存储键只允许 synthspark 写法，
 * 独立性门里有一条静态检查守着字面量键）。
 *
 * 用模块级 ref 而不是 pinia store：音效开关要被**非组件**模块读取（`input/sfx.ts`
 * 每次播放都要问一句开关状态），而 pinia store 在组件外读要先拿到 pinia 实例。
 * 偏好项只有三个、彼此独立、没有业务逻辑，模块级 ref 更直白。
 */

const NS = 'synthspark-icespark'
const KEY_SOUND = `${NS}-sound`
const KEY_SOUND_PROMPT = `${NS}-sound-prompt`
const KEY_PAGE_SIZE = `${NS}-page-size`
const KEY_MOTION = `${NS}-motion`

/** CRT 强度固定档：3 = 原教旨（满强度扫描线 + 暗角 + 像素字体）。不再暴露给用户配置 */
export const SIGNAL_LEVEL = 3

/**
 * 每页条数可选值。
 *
 * 样机里是 4 / 6（6 篇样张正好两页，翻页效果看得见）。
 * 真实数据量下这两个值偏小，P3 做列表页时按旧前端的默认值重新定 ——
 * 这一项属于「交互细节」，动它之前先跟用户确认。
 */
export const PAGE_SIZE_OPTIONS = [4, 6] as const

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value)
  } catch {
    /* 存不进去不算致命 */
  }
}

function clampPageSize(value: number): number {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value) ? value : 4
}

/** 音效开关，默认关闭（首次交互时询问，见外壳的音效询问） */
export const soundEnabled = ref<boolean>(readStorage(KEY_SOUND) === '1')

/** 首次音效询问是否已经问过 */
export const soundPromptShown = ref<boolean>(readStorage(KEY_SOUND_PROMPT) === '1')

/** 列表每页条数，默认 4 */
export const pageSize = ref<number>(clampPageSize(Number(readStorage(KEY_PAGE_SIZE) ?? 4)))

/** 动效开关（转场 / 翻页 / 光标闪烁），默认开启 */
export const motionEnabled = ref<boolean>(readStorage(KEY_MOTION) !== '0')

export function setSound(enabled: boolean): void {
  soundEnabled.value = enabled
}

export function setPageSize(size: number): void {
  pageSize.value = clampPageSize(size)
}

export function setMotion(enabled: boolean): void {
  motionEnabled.value = enabled
}

export function markSoundPromptShown(): void {
  soundPromptShown.value = true
  writeStorage(KEY_SOUND_PROMPT, '1')
}

// 持久化：值一变就落盘
watch(soundEnabled, (value) => writeStorage(KEY_SOUND, value ? '1' : '0'))
watch(pageSize, (value) => writeStorage(KEY_PAGE_SIZE, String(value)))
watch(motionEnabled, (value) => writeStorage(KEY_MOTION, value ? '1' : '0'))
