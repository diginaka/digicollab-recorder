# digicollab-recorder

録画 + テレプロンプター + 台本AI統合 Web アプリ。デジコラボ各テンプレート（コース / VSL / オートウェビナー / サンクス / LINE / メール）から呼び出し可能な共通録画インフラ。

- 本番ドメイン: https://record.digicollabo.com
- 認証: SSO v2（ハブ: digicollabo.com）
- データ: Supabase プロジェクト `whpqheywobndaeaikchh`（フロービルダー本番と共用）
- 動画配信: Bunny Stream（Library ID: 643370）

## Scripts

```bash
npm install
npm run dev       # localhost:5173
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # built dist をローカル確認
npm run lint      # tsc --noEmit
```

## Deploy

Cloudflare Pages で自動ビルド・デプロイ:

- Framework preset: None
- Build command: `npm install && npm run build`
- Output directory: `dist`
- Root directory: `/`

### 環境変数（Cloudflare Pages ダッシュボード）

- `SKIP_DEPENDENCY_INSTALL=true`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_HUB_URL=https://digicollabo.com`
- `VITE_BUNNY_LIBRARY_ID=643370`
- `VITE_BUNNY_CDN_HOSTNAME=vz-6990e254-d1c.b-cdn.net`

## 関連リポジトリ

- [digicollab-flow-builder](https://github.com/diginaka/digicollab-flow-builder) — 認証ハブ（SSO v2 issuer）
- [digicollab-line](https://github.com/diginaka/digicollab-line) — SSO v2 子アプリ参考実装
- [DIGICOLLAB-COURSE](https://github.com/diginaka/DIGICOLLAB-COURSE) — テレプロンプター UI 参考実装

## License

MIT
