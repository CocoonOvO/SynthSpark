/**
 * 用户偏好（音效 / 每页条数 / 动效）
 *
 * 信号档已取消：CRT 强度固定为最高档（SIGNAL_LEVEL），不再暴露给用户配置。
 * 音效默认静音，首次交互时询问（见 App.vue）。
 */
import { ref, watch } from 'vue'

const NS = 'synthspark-icespark'
const LS_SOUND = `${NS}-sound`
const LS_PROMPT = `${NS}-sound-prompt`
const LS_PAGE_SIZE = `${NS}-page-size`
const LS_MOTION = `${NS}-motion`

/** CRT 强度固定档：3 = 原教旨（满强度扫描线 + 暗角 + 像素字体） */
export const SIGNAL_LEVEL = 3

/** 每页条数可选值 */
export const PAGE_SIZE_OPTIONS = [4, 6] as const

function readLS(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage?.setItem(key, value)
  } catch {
    /* 隐私模式下静默失败 */
  }
}

function clampPageSize(n: number): number {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : 4
}

/** 音效开关，默认关闭 */
export const soundEnabled = ref<boolean>(readLS(LS_SOUND) === '1')

/** 首次音效询问是否已经问过 */
export const soundPromptShown = ref<boolean>(readLS(LS_PROMPT) === '1')

/** 列表每页条数，默认 4（6 篇文章正好两页，翻页效果看得见） */
export const pageSize = ref<number>(clampPageSize(Number(readLS(LS_PAGE_SIZE) ?? 4)))

/** 动效开关（转场 / 翻页 / 光标闪烁），默认开启 */
export const motionEnabled = ref<boolean>(readLS(LS_MOTION) !== '0')

export function setSound(on: boolean) {
  soundEnabled.value = on
}

export function setPageSize(n: number) {
  pageSize.value = clampPageSize(n)
}

export function setMotion(on: boolean) {
  motionEnabled.value = on
}

export function markSoundPromptShown() {
  soundPromptShown.value = true
  writeLS(LS_PROMPT, '1')
}

// 持久化
watch(soundEnabled, (v) => writeLS(LS_SOUND, v ? '1' : '0'))
watch(pageSize, (v) => writeLS(LS_PAGE_SIZE, String(v)))
watch(motionEnabled, (v) => writeLS(LS_MOTION, v ? '1' : '0'))
