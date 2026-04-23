// URL クエリから呼び出し元情報を抽出する。
//
// 呼び出し例 (コースから):
//   https://record.digicollabo.com/record?app_id=course&source_ref=<lesson-id>&script_id=<script-id>&return_to=<encoded-url>
//
// - scriptId: 既存台本を事前ロードする際の fb_scripts.id
// - returnTo: 録画完了後の戻り先 URL (encoded)
// - appId: 呼び出し元テンプレート識別子 (course / sales / webinar / thanks / line / email)
// - sourceRef: 呼び出し元レコードの任意 UUID (lesson_id / campaign_id 等)

export interface LaunchParams {
  scriptId: string | null
  returnTo: string | null
  appId: string | null
  sourceRef: string | null
}

export function useLaunchParams(): LaunchParams {
  if (typeof window === 'undefined') {
    return { scriptId: null, returnTo: null, appId: null, sourceRef: null }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    scriptId: params.get('script_id'),
    returnTo: params.get('return_to'),
    appId: params.get('app_id'),
    sourceRef: params.get('source_ref'),
  }
}
