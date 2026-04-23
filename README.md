# digicollab-recorder

録画 + テレプロンプター + 台本AI統合 Web アプリ。デジコラボ各テンプレート(コース / VSL / オートウェビナー / サンクス / LINE / メール)から呼び出し可能な共通録画インフラ。

- 本番ドメイン: https://record.digicollabo.com
- 認証: SSO v2(ハブ: digicollabo.com)
- データ: Supabase プロジェクト `whpqheywobndaeaikchh`(フロービルダー本番と共用)
- 動画配信: Bunny Stream(Library ID: 643370)

## Scripts

```bash
npm install
npm run dev       # localhost:5173
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # built dist をローカル確認
npm run lint      # tsc --noEmit
```

## Deploy

Cloudflare Pages で自動ビルド・デプロイ。**詳細な手順は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照**。

### ビルド設定

- Framework preset: None
- Build command: `npm install && npm run build`
- Output directory: `dist`
- Root directory: `/`

### 環境変数(Cloudflare Pages ダッシュボード)

本番環境で設定が必要な環境変数は以下の 5 つ(+ ビルドフラグ 1 つ)です。

| 変数名 | 値 | 説明 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://whpqheywobndaeaikchh.supabase.co` | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | (Supabase ダッシュボード → API → anon public) | クライアント側 Supabase 認証用キー(公開前提) |
| `VITE_AUTH_HUB_URL` | `https://digicollabo.com` | SSO ハブ(未認証時のリダイレクト先) |
| `VITE_BUNNY_LIBRARY_ID` | `643370` | Bunny Stream Library ID |
| `VITE_BUNNY_CDN_HOSTNAME` | `vz-6990e254-d1c.b-cdn.net` | Bunny Stream CDN ホスト名(プレビュー時に使用) |
| `SKIP_DEPENDENCY_INSTALL` | `true` | ビルドフラグ(Cloudflare Pages がデフォルトで実施する `npm install` を**重複させない**ため) |

`SKIP_DEPENDENCY_INSTALL=true` の意味:
- Build command に `npm install && npm run build` と明示指定する運用のため、CF Pages のデフォルト `npm install` と重複実行を避ける設定です。ビルド時間短縮と競合回避の目的。

### 関連 Secret(Supabase Edge Functions 側、**Cloudflare には不要**)

以下の 10 個は Supabase ダッシュボード → Edge Functions → Secrets で管理(Cloudflare Pages には設定しません):

- Bunny Stream: `BUNNY_STREAM_API_KEY` / `BUNNY_STREAM_LIBRARY_ID` / `BUNNY_STREAM_CDN_HOSTNAME` / `BUNNY_STREAM_PULL_ZONE`
- Cloudflare R2(Phase V1/V2 用途、Phase 1 では未使用): `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL_BASE` / `R2_S3_ENDPOINT` / `R2_ACCOUNT_ID`
- Webhook 検証: `BUNNY_WEBHOOK_URL_TOKEN`

## 関連リポジトリ

- [digicollab-flow-builder](https://github.com/diginaka/digicollab-flow-builder) — 認証ハブ(SSO v2 issuer)
- [digicollab-line](https://github.com/diginaka/digicollab-line) — SSO v2 子アプリ参考実装
- [DIGICOLLAB-COURSE](https://github.com/diginaka/DIGICOLLAB-COURSE) — テレプロンプター UI 参考実装

## ドキュメント

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — 本番デプロイ手順書(Cloudflare Pages / DNS / SSL / 動作確認)
- [docs/FUTURE-INTEGRATION.md](docs/FUTURE-INTEGRATION.md) — Phase V1/V2 統合 + Bunny 動画削除の将来課題

## License

MIT
