/**
 * 用户偏好（信号档 / 音效）
 *
 * 信号档 Signal Level：一个旋钮同时管 CRT 强度、字体模式、动效强度
 *   0 纯净 · 1 阅读 · 2 标准 · 3 原教旨
 * 音效默认静音，首次交互时询问（见 App.vue）
 */
import { ref, watch } from 'vue'

const LS_SIGNAL = 'icespark-signal'
const LS_SOUND = 'icespark-sound'
const LS_PROMPT = 'icespark-sound-prompt'

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

/** 信号档 0–3，默认 2（标准） */
export const signalLevel = ref<number>(clampSignal(Number(readLS(LS_SIGNAL) ?? 2)))

/** 音效开关，默认关闭 */
export const soundEnabled = ref<boolean>(readLS(LS_SOUND) === '1')

/** 首次音效询问是否已经问过 */
export const soundPromptShown = ref<boolean>(readLS(LS_PROMPT) === '1')

export const SIGNAL_LABELS = ['纯净', '阅读', '标准', '原教旨'] as const

export const SIGNAL_DESC = [
  '关闭 CRT 与动效，全站现代字体',
  '极轻扫描线，正文走阅读层，仅保留转场',
  '标准扫描线与暗角，像素字体，动效全开',
  '满强度 CRT，含刷新微抖，一切走像素字体',
] as const

function clampSignal(n: number): number {
  if (Number.isNaN(n)) return 2
  return Math.max(0, Math.min(3, Math.round(n)))
}

export function setSignal(n: number) {
  signalLevel.value = clampSignal(n)
}

export function setSound(on: boolean) {
  soundEnabled.value = on
}

export function markSoundPromptShown() {
  soundPromptShown.value = true
  writeLS(LS_PROMPT, '1')
}

// 持久化
watch(signalLevel, (v) => writeLS(LS_SIGNAL, String(v)))
watch(soundEnabled, (v) => writeLS(LS_SOUND, v ? '1' : '0'))
