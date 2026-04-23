import { Link } from 'react-router-dom'
import { ArrowLeft, Video } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useDeviceCapability } from '../hooks/useDeviceCapability'
import { useLaunchParams } from '../hooks/useLaunchParams'

export default function Record() {
  const device = useDeviceCapability()
  const launch = useLaunchParams()

  return (
    <Layout>
      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-emerald-700 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          \u30db\u30fc\u30e0\u3078
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 inline-flex items-center gap-2">
          <Video className="w-7 h-7 text-gray-700" />
          \u9332\u753b
        </h1>

        <section className="rounded-xl border border-gray-200 bg-white p-5 mb-5 text-sm text-gray-700 space-y-1.5">
          <p className="font-semibold text-gray-900 mb-2">\u304a\u4f7f\u3044\u306e\u74b0\u5883</p>
          <p>
            \u30b9\u30de\u30db\u3084\u30bf\u30d6\u30ec\u30c3\u30c8: {device.isMobile ? '\u306f\u3044' : '\u3044\u3044\u3048 (PC)'}
          </p>
          <p>
            \u30ab\u30e1\u30e9\u9332\u753b: {device.canCameraRecord ? '\u3067\u304d\u307e\u3059' : '\u3067\u304d\u307e\u305b\u3093'}
          </p>
          <p>
            \u753b\u9762\u9332\u753b: {device.canScreenRecord ? '\u3067\u304d\u307e\u3059 (PC \u306e\u307f)' : '\u3067\u304d\u307e\u305b\u3093'}
          </p>
        </section>

        {(launch.appId || launch.scriptId || launch.returnTo) && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 mb-5 text-sm text-emerald-900 space-y-1">
            <p className="font-semibold mb-2">\u547c\u3073\u51fa\u3057\u5143\u306e\u60c5\u5831</p>
            {launch.appId && <p>\u30a2\u30d7\u30ea: {launch.appId}</p>}
            {launch.scriptId && <p>\u53f0\u672c ID: {launch.scriptId}</p>}
            {launch.sourceRef && <p>\u5143\u30ec\u30b3\u30fc\u30c9: {launch.sourceRef}</p>}
            {launch.returnTo && (
              <p className="break-all">\u623b\u308a\u5148: {launch.returnTo}</p>
            )}
          </section>
        )}

        <p className="text-sm text-gray-500 text-center mt-10">
          Phase D \u3067\u30ab\u30e1\u30e9/\u753b\u9762\u9332\u753b + \u30c6\u30ec\u30d7\u30ed\u30f3\u30d7\u30bf\u30fc + \u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3092\u5b9f\u88c5\u3057\u307e\u3059\u3002
        </p>
      </div>
    </Layout>
  )
}
