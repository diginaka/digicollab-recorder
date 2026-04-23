// MediaRecorder ラッパー — selfie / screen 両モードに対応。
//
// 使い方:
//   const r = new VideoRecorder()
//   await r.startSelfie()       // getUserMedia 許可ダイアログ
//   // r.getStream() でプレビュー video に接続
//   r.startRecording()          // 実録画開始
//   // ...
//   const blob = await r.stop() // 停止 + Blob 返却 + stream 片付け
//
// mimeType 優先順位: video/webm;codecs=vp9,opus → video/webm
// videoBitsPerSecond: 2_500_000 (標準的な 720p の目安)
// chunkSize timeslice: 1000ms (1 秒ごとに dataavailable)

export type RecorderMode = 'selfie' | 'screen'

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

function pickMimeType(): string {
  for (const m of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

export class VideoRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mimeType = ''

  async startSelfie(): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('camera not available')
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: true,
    })
    return this.stream
  }

  async startScreen(): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('screen capture not available')
    }
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    })
    return this.stream
  }

  startRecording(): void {
    if (!this.stream) throw new Error('no active stream; call startSelfie/startScreen first')
    this.mimeType = pickMimeType()
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 2_500_000,
    })
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(1000)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') {
        const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' })
        this.cleanup()
        resolve(blob)
        return
      }
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' })
        this.cleanup()
        resolve(blob)
      }
      rec.onerror = (ev: Event) => {
        const errEv = ev as ErrorEvent
        this.cleanup()
        reject(errEv.error ?? new Error('recording error'))
      }
      try {
        rec.stop()
      } catch (e) {
        this.cleanup()
        reject(e)
      }
    })
  }

  /** 録画を開始せずに stream だけ破棄する */
  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        /* noop */
      }
    }
    this.cleanup()
  }

  getStream(): MediaStream | null {
    return this.stream
  }

  getMimeType(): string {
    return this.mimeType
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
    // chunks は resolve 側で新 Blob 化済み。次回録画のため空に
    this.chunks = []
  }
}
