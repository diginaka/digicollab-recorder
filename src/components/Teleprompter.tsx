// テレプロンプター — DIGICOLLAB-COURSE/src/pages/StudioStep1.tsx の
// requestAnimationFrame 方式を移植し、仕様書の要件に合わせて改修:
//  - 速度 x0.5 / x1 / x1.5 / x2 の 4 段階(循環)
//  - フォントサイズ 小 20px / 中 28px / 大 36px (循環)
//  - 背景 純黒 #000、文字色 白 #fff / 淡黄 #ffeb99 の選択可能
//  - 行間 1.9 (1.8〜2.0 の中間)
//  - course 固有ロジック(widgetId / FacePop / chapters)は除去
import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Type as TypeIcon,
  Palette,
} from 'lucide-react'

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const
type Speed = (typeof SPEED_OPTIONS)[number]

type FontSize = 'sm' | 'md' | 'lg'
const FONT_SIZE_PX: Record<FontSize, number> = { sm: 20, md: 28, lg: 36 }
const FONT_SIZE_LABEL: Record<FontSize, string> = { sm: '小', md: '中', lg: '大' }

type TextColor = 'white' | 'amber'
const TEXT_COLOR_HEX: Record<TextColor, string> = {
  white: '#ffffff',
  amber: '#ffeb99',
}
const TEXT_COLOR_LABEL: Record<TextColor, string> = { white: '白', amber: '淡黄' }

interface TeleprompterProps {
  text: string
  /** true にすると mount 直後から再生開始(録画同期用) */
  autoPlay?: boolean
  /** 外部から再生トリガーを発火させたい場合のキー(値が変わると再生開始) */
  playTrigger?: number
  /** 再生状態の外部通知(停止で呼ばれる) */
  onPlayStateChange?: (playing: boolean) => void
}

export function Teleprompter({
  text,
  autoPlay = false,
  playTrigger,
  onPlayStateChange,
}: TeleprompterProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [speedIndex, setSpeedIndex] = useState<number>(1) // default x1
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [textColor, setTextColor] = useState<TextColor>('white')

  const scrollRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const scrollPosRef = useRef<number>(0)

  const speed: Speed = SPEED_OPTIONS[speedIndex] ?? 1

  // 外部トリガーで再生開始
  useEffect(() => {
    if (playTrigger !== undefined && playTrigger > 0) {
      scrollPosRef.current = 0
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      setIsPlaying(true)
    }
  }, [playTrigger])

  // 再生状態変化を外部に通知
  useEffect(() => {
    onPlayStateChange?.(isPlaying)
  }, [isPlaying, onPlayStateChange])

  // 自動スクロール(requestAnimationFrame)
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const el = scrollRef.current
    const pixelsPerFrame = speed * 0.8

    const tick = () => {
      scrollPosRef.current += pixelsPerFrame
      el.scrollTop = scrollPosRef.current
      if (scrollPosRef.current >= el.scrollHeight - el.clientHeight - 2) {
        setIsPlaying(false)
        return
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, speed])

  const nudge = (dir: 'up' | 'down') => {
    if (!scrollRef.current) return
    const delta = dir === 'up' ? -80 : 80
    scrollPosRef.current = Math.max(0, scrollPosRef.current + delta)
    scrollRef.current.scrollTop = scrollPosRef.current
  }

  const reset = () => {
    scrollPosRef.current = 0
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setIsPlaying(false)
  }

  const cycleSpeed = () => {
    setSpeedIndex((i) => (i + 1) % SPEED_OPTIONS.length)
  }

  const cycleFontSize = () => {
    setFontSize((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'))
  }

  const toggleColor = () => {
    setTextColor((c) => (c === 'white' ? 'amber' : 'white'))
  }

  const iconBtn =
    'p-2.5 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition disabled:opacity-40'
  const textBtn =
    'px-3 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition text-sm font-medium min-w-[56px]'

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl overflow-hidden border border-gray-800">
      {/* 本文表示 — 純黒背景 + 大きめ文字 */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-8"
        style={{ background: '#000' }}
      >
        <div
          className="whitespace-pre-wrap text-center max-w-3xl mx-auto"
          style={{
            color: TEXT_COLOR_HEX[textColor],
            fontSize: `${FONT_SIZE_PX[fontSize]}px`,
            lineHeight: 1.9,
            fontWeight: 500,
          }}
        >
          {text.trim() ? text : '(台本が空です)'}
        </div>
        {/* スクロール末尾のスペーサー: 最終行が画面中央で止まるように */}
        <div style={{ height: '35vh' }} aria-hidden="true" />
      </div>

      {/* コントロールバー */}
      <div className="bg-gray-900 px-3 py-3 flex items-center justify-center gap-2 flex-wrap">
        <button onClick={() => nudge('up')} className={iconBtn} aria-label="少し上へ">
          <ChevronUp className="w-5 h-5" />
        </button>
        <button
          onClick={cycleSpeed}
          className={textBtn}
          aria-label={`速度を変える (現在 x${speed})`}
        >
          <span className="font-mono">x{speed}</span>
        </button>
        <button onClick={() => nudge('down')} className={iconBtn} aria-label="少し下へ">
          <ChevronDown className="w-5 h-5" />
        </button>

        <button
          onClick={() => setIsPlaying((p) => !p)}
          className={[
            'p-3 rounded-lg text-white transition',
            isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700',
          ].join(' ')}
          aria-label={isPlaying ? '一時停止' : '再生'}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        <button onClick={reset} className={iconBtn} aria-label="先頭に戻る">
          <RotateCcw className="w-5 h-5" />
        </button>

        <div className="h-7 border-l border-gray-700 mx-1" />

        <button onClick={cycleFontSize} className={textBtn} aria-label="文字サイズを変える">
          <TypeIcon className="w-4 h-4 inline -mt-0.5 mr-1" />
          {FONT_SIZE_LABEL[fontSize]}
        </button>

        <button
          onClick={toggleColor}
          className="px-3 py-2 rounded-lg text-sm font-medium min-w-[56px] border border-gray-700 transition hover:opacity-80"
          style={{
            background: TEXT_COLOR_HEX[textColor],
            color: '#000',
          }}
          aria-label="文字色を変える"
        >
          <Palette className="w-4 h-4 inline -mt-0.5 mr-1" />
          {TEXT_COLOR_LABEL[textColor]}
        </button>
      </div>
    </div>
  )
}
