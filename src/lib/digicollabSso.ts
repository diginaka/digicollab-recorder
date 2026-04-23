/**
 * デジコラボ統一 SSO クライアント v2 (PKCE Exchange 方式) — TS 移植版
 *
 * ハブ (digicollabo.com = flow-builder) から渡された sso_code を fb-sso-exchange
 * Edge Function と交換して、独立した新規セッション (access_token + refresh_token) を得る。
 *
 * 旧方式 (sso_token / sso_refresh) との互換:
 *   - sso_code があればそれを優先
 *   - sso_code が無く旧方式パラメータがあればフォールバック
 *   - 両方ない場合は既存セッションを確認、無ければハブへリダイレクト
 *
 * 使い方:
 *   const ok = await initSSO()
 *   if (!ok) return  // リダイレクト発生中
 */
import { supabase } from './supabase'

const HUB_URL: string = import.meta.env.VITE_AUTH_HUB_URL || 'https://digicollabo.com'

export function redirectToHub(): void {
  const currentUrl = encodeURIComponent(window.location.href)
  window.location.href = `${HUB_URL}?return_to=${currentUrl}`
}

export async function initSSO(): Promise<boolean> {
  // 旧バージョンが残した localStorage キーを掃除 (sb-* で sb-digicollab-* 以外)
  try {
    const legacyKeys = Object.keys(localStorage).filter(
      (k) => k.startsWith('sb-') && !k.startsWith('sb-digicollab-'),
    )
    legacyKeys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* localStorage アクセス不可環境は無視 */
  }

  const sb = supabase
  if (!sb) {
    console.warn('[SSO] Supabase 未接続')
    return false
  }

  const url = new URL(window.location.href)
  const ssoCode = url.searchParams.get('sso_code')
  const ssoToken = url.searchParams.get('sso_token')
  const ssoRefresh = url.searchParams.get('sso_refresh')
  const ssoReturn = url.searchParams.get('sso_return')

  const cleanUrl = (): void => {
    url.searchParams.delete('sso_code')
    url.searchParams.delete('sso_token')
    url.searchParams.delete('sso_refresh')
    url.searchParams.delete('sso_return')
    window.history.replaceState({}, '', url.toString())
  }

  // ─ 新方式: sso_code を exchange ─
  if (ssoCode) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/fb-sso-exchange`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sso_code: ssoCode }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        access_token?: string
        refresh_token?: string
        error?: string
      }
      if (!res.ok || !json.success || !json.access_token || !json.refresh_token) {
        console.error('[SSO] exchange failed:', json?.error ?? res.status)
        cleanUrl()
        redirectToHub()
        return false
      }
      const { error: setErr } = await sb.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      })
      cleanUrl()
      if (setErr) {
        console.error('[SSO] setSession failed after exchange:', setErr)
        redirectToHub()
        return false
      }
      if (ssoReturn) {
        try {
          window.location.href = decodeURIComponent(ssoReturn)
          return true
        } catch {
          /* decode 失敗は無視して現在ページを継続 */
        }
      }
      return true
    } catch (e) {
      console.error('[SSO] exchange error:', e)
      cleanUrl()
      redirectToHub()
      return false
    }
  }

  // ─ 旧方式: sso_token + sso_refresh を直接セット ─
  if (ssoToken && ssoRefresh) {
    const { error } = await sb.auth.setSession({
      access_token: ssoToken,
      refresh_token: ssoRefresh,
    })
    cleanUrl()
    if (error) {
      console.error('[SSO] legacy setSession failed:', error)
      redirectToHub()
      return false
    }
    if (ssoReturn) {
      try {
        window.location.href = decodeURIComponent(ssoReturn)
        return true
      } catch {
        /* noop */
      }
    }
    return true
  }

  // ─ SSO パラメータ無し: 既存セッションを確認 ─
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session) {
    redirectToHub()
    return false
  }
  return true
}

/**
 * 60 秒ごとのセッション再取得。
 * impersonation 切替や意図しないサインアウトを検出してリダイレクト/リロード。
 * @returns 解除用の関数
 */
export function startSessionPolling(currentUserId: string): () => void {
  const sb = supabase
  if (!sb) return () => {}
  const timer = window.setInterval(async () => {
    try {
      const {
        data: { session },
      } = await sb.auth.getSession()
      if (!session) {
        redirectToHub()
        return
      }
      if (session.user.id !== currentUserId) {
        console.log('[SSO] user switched, reloading')
        window.location.reload()
      }
    } catch (err) {
      console.warn('[SSO] session polling error:', err)
    }
  }, 60_000)
  return () => window.clearInterval(timer)
}
