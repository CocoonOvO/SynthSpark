import { soundEnabled } from '@/config/prefs'

/**
 * 8bit 音效引擎。
 *
 * 用 WebAudio 的方波振荡器**现场合成**，不加载任何音频资源：零体积，
 * 而且方波正是 8bit 音源（PSG）的本味。
 *
 * 放在输入层（而不是随手放个 utils）：每一声都对应一次**离散输入事件** ——
 * 移动、确认、点赞、转场。这也正是「鼠标划过必须静音」这条规则的原因：
 * 划过不是离散事件，出声会变成噪音轰炸。
 *
 * 浏览器要求先有用户手势才能启动音频，所以 AudioContext 懒初始化。
 */

export type SfxKind = 'move' | 'confirm' | 'heart' | 'transition'

let context: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  if (!context) context = new Ctor()
  // 自动播放策略：被挂起时尝试恢复（有用户手势后即可成功）
  if (context.state === 'suspended') void context.resume()
  return context
}

/** 单个方波音符：快起音 + 指数衰减，最典型的 PSG 音色 */
function tone(frequency: number, startSec: number, durationSec: number, gain = 0.05): void {
  const audio = ensureContext()
  if (!audio) return

  const start = audio.currentTime + startSec
  const oscillator = audio.createOscillator()
  const volume = audio.createGain()

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(frequency, start)
  volume.gain.setValueAtTime(0.0001, start)
  volume.gain.linearRampToValueAtTime(gain, start + 0.006)
  volume.gain.exponentialRampToValueAtTime(0.0001, start + durationSec)

  oscillator.connect(volume)
  volume.connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(start + durationSec + 0.02)
}

/** 频率扫描：转场音（老机器的「唰」） */
function sweep(from: number, to: number, durationSec: number, gain = 0.045): void {
  const audio = ensureContext()
  if (!audio) return

  const start = audio.currentTime
  const oscillator = audio.createOscillator()
  const volume = audio.createGain()

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.linearRampToValueAtTime(to, start + durationSec)
  volume.gain.setValueAtTime(gain, start)
  volume.gain.exponentialRampToValueAtTime(0.0001, start + durationSec)

  oscillator.connect(volume)
  volume.connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(start + durationSec + 0.02)
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

/** 统一入口：自动检查开关；无声卡等情况静默失败，绝不影响交互 */
export function playSfx(kind: SfxKind): void {
  if (!soundEnabled.value) return
  try {
    RECIPES[kind]()
  } catch {
    /* 忽略 */
  }
}

/** 试听：用于「音效」开关打开时给一声确认，无视开关状态 */
export function previewSfx(kind: SfxKind = 'confirm'): void {
  try {
    RECIPES[kind]()
  } catch {
    /* 忽略 */
  }
}
