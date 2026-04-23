// デバイス能力判定:
// - スマホは自撮り録画のみ (画面録画は PC のみ)
// - iOS Safari は HTTPS 必須 (Cloudflare Pages 上で自動)
// - MediaRecorder は全対応ブラウザで利用可能

export interface DeviceCapability {
  isMobile: boolean
  isIOS: boolean
  isAndroid: boolean
  canScreenRecord: boolean
  canCameraRecord: boolean
}

export function useDeviceCapability(): DeviceCapability {
  if (typeof navigator === 'undefined') {
    return {
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      canScreenRecord: false,
      canCameraRecord: false,
    }
  }
  const ua = navigator.userAgent
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const hasMediaDevices = !!navigator.mediaDevices
  const canScreenRecord =
    !isMobile &&
    hasMediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  const canCameraRecord =
    hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
  return { isMobile, isIOS, isAndroid, canScreenRecord, canCameraRecord }
}
