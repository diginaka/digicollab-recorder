// Phase A スタブ — Phase D で MediaRecorder + テレプロンプターを組み込む
import { Link } from 'react-router-dom'
import { useDeviceCapability } from '../hooks/useDeviceCapability'
import { useLaunchParams } from '../hooks/useLaunchParams'

export default function Record() {
  const device = useDeviceCapability()
  const launch = useLaunchParams()

  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-emerald-700 hover:underline">
        ← 戻る
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">録画</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6 text-sm text-gray-700 space-y-1">
        <p className="font-semibold text-gray-900 mb-2">デバイス情報</p>
        <p>モバイル: {device.isMobile ? 'はい' : 'いいえ'}</p>
        <p>カメラ録画可能: {device.canCameraRecord ? 'はい' : 'いいえ'}</p>
        <p>画面録画可能: {device.canScreenRecord ? 'はい (PC のみ)' : 'いいえ'}</p>
      </section>

      {(launch.appId || launch.scriptId || launch.returnTo) && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 mb-6 text-sm text-emerald-900 space-y-1">
          <p className="font-semibold mb-2">呼び出し情報</p>
          {launch.appId && <p>呼び出し元: {launch.appId}</p>}
          {launch.scriptId && <p>台本 ID: {launch.scriptId}</p>}
          {launch.sourceRef && <p>ソース参照: {launch.sourceRef}</p>}
          {launch.returnTo && <p>戻り先: {launch.returnTo}</p>}
        </section>
      )}

      <p className="text-sm text-gray-500 text-center mt-10">
        Phase D で MediaRecorder + テレプロンプター + Bunny Stream アップロードを実装します。
      </p>
    </div>
  )
}
