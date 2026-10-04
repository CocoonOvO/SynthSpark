/**
 * 8bit 音效引擎
 *
 * 用 WebAudio 的方波振荡器现场合成，不加载任何音频资源 —— 零体积，
 * 且方波正是 8bit 音源（PSG）的本味。
 *
 * 关键规则（共享焦点模型带来的约束）：
 * - 键盘移动焦点：出声（一格一声，离散事件）
 * - 鼠标移动焦点：静音（划过不是离散事件，出声会变成噪音轰炸）
 * - 点击确认：出声
 *
 * 浏览器要求必须有用户手势才能启动音频，因此 AudioContext 懒初始化。
 */
import { soundEnabled } from './prefs'

export type SfxKind = 'move' | 'confirm' | 'heart' | 'transition'

let ctx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  // 自动播放策略：被挂起时尝试恢复（有用户手势后即可成功）
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 单个方波音符：快起音 + 指数衰减，最典型的 PSG 音色 */
function tone(freq: number, startSec: number, durSec: number, gain = 0.05) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime + startSec
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + durSec + 0.02)
}

/** 频率扫描：用于转场音（老机器的「唰」） */
function sweep(from: number, to: number, durSec: number, gain = 0.045) {
  const c = ensureCtx()
  if (!c) return
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(from, t0)
  osc.frequency.linearRampToValueAtTime(to, t0 + durSec)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + durSec + 0.02)
}

/** 四种音效本体 */
const RECIPES: Record<SfxKind, () => void> = {
  // 光标移动：极短的一声 blip
  move: () => tone(880, 0, 0.035, 0.04),
  // 确认：两段上行 chirp
  confirm: () => {
    tone(660, 0, 0.05, 0.05)
    tone(990, 0.05, 0.08, 0.05)
  },
  // 加心：马里奥金币式两段音（B5 → E6）
  heart: () => {
    tone(988, 0, 0.06, 0.055)
    tone(1319, 0.06, 0.3, 0.05)
  },
  // 转场：下降扫描
  transition: () => sweep(1200, 320, 0.16, 0.04),
}

/** 统一播放入口：自动检查开关，并在首次播放时解锁 AudioContext */
export function playSfx(kind: SfxKind) {
  if (!soundEnabled.value) return
  try {
    RECIPES[kind]()
  } catch {
    /* 无音频设备等情况静默失败，绝不影响交互 */
  }
}

/** 试听（用于音效开关开启时给一声确认，无视开关状态） */
export function previewSfx(kind: SfxKind = 'confirm') {
  try {
    RECIPES[kind]()
  } catch {
    /* 忽略 */
  }
}
