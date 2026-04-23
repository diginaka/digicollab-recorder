# 本番デプロイ手順書 — record.digicollabo.com

**対象**: `digicollab-recorder` を Cloudflare Pages で本番公開する作業手順。
**所要時間**: 約 20〜40 分(DNS 伝播待ちを含む)。
**前提**: GitHub リポジトリ [diginaka/digicollab-recorder](https://github.com/diginaka/digicollab-recorder) が push 済み、`main` ブランチがビルド可能な状態。

---

## 0. 事前準備チェックリスト

以下がすべて揃っていることを確認してください。

- [ ] Cloudflare アカウントに **Pages** へのアクセス権がある
- [ ] `digicollabo.com` の DNS ゾーンが Cloudflare 管理下にある
- [ ] Supabase プロジェクト `whpqheywobndaeaikchh` の以下が登録済み
  - [ ] Edge Functions: `fb-bunny-upload-token` / `fb-bunny-webhook` / `fb-ai-script-generate` が ACTIVE
  - [ ] Secrets: Bunny 系 4 個 + R2 系 6 個 + `BUNNY_WEBHOOK_URL_TOKEN` = 合計 11 個
- [ ] Bunny Stream Library ID `643370` の Webhook URL が
  `https://whpqheywobndaeaikchh.supabase.co/functions/v1/fb-bunny-webhook?token=<TOKEN>` に設定済み
- [ ] Bunny Stream Allowed Domains に `*.digicollabo.com` が登録済み
- [ ] 取得可能な **Supabase anon public key** の値を手元にコピー済み

---

## 1. Cloudflare Pages プロジェクト作成

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 連携(初回のみ):
   - "Install & Authorize Cloudflare Pages" → `diginaka` 組織を選択
   - リポジトリアクセスは最小限(`digicollab-recorder` のみ推奨)
3. リポジトリ選択:
   - Account: `diginaka`
   - Repository: `digicollab-recorder`
   - **Begin setup** をクリック

---

## 2. ビルド設定

**Set up builds and deployments** ページで以下を入力。

| 項目 | 値 |
|---|---|
| Project name | `digicollab-recorder` |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |
| Root directory(Advanced) | 空欄(リポジトリルートを使用) |

**"Save and Deploy" はまだ押さずに**、次セクションで環境変数を先に設定します(初回ビルドに環境変数が反映されない事故を避けるため)。

---

## 3. 環境変数の設定

同じ **Set up builds and deployments** ページの **"Environment variables (advanced)"** を展開し、以下 6 つを **Production** に登録します(**Preview** にも同じ値を入れておくと PR プレビュー時に動く)。

| Variable name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://whpqheywobndaeaikchh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (事前準備でコピーした anon public key) |
| `VITE_AUTH_HUB_URL` | `https://digicollabo.com` |
| `VITE_BUNNY_LIBRARY_ID` | `643370` |
| `VITE_BUNNY_CDN_HOSTNAME` | `vz-6990e254-d1c.b-cdn.net` |
| `SKIP_DEPENDENCY_INSTALL` | `true` |

**注意**:
- `VITE_` 接頭辞はクライアントバンドルに含まれるため、**秘密値を入れてはいけません**(anon key は意図的に公開前提の値なので OK)。
- `VITE_SUPABASE_ANON_KEY` は Cloudflare Pages の UI 上で "Encrypt" を選択しても中身はバンドルに出ます(設計上の性質で、anon key ではこれが正常)。

**Save and Deploy** をクリックして初回ビルドを開始。

---

## 4. 初回ビルドの監視

- ビルドログは **Deployments** タブから確認。想定所要時間:
  - `npm install` 約 30 秒
  - `tsc --noEmit` + `vite build` 約 5 秒
  - **合計 1 分以内**
- 成功時: `https://digicollab-recorder.pages.dev` で暫定公開される
- 失敗時: ビルドログで原因特定。よくある失敗は[§ 10. トラブルシューティング](#10-トラブルシューティング)参照。

一度 `digicollab-recorder.pages.dev` を開き、**"読み込み中..." が表示されてリダイレクトが始まる**(ハブ側への認可フロー)ことを確認。

---

## 5. カスタムドメイン設定

1. プロジェクトページ → **Custom domains** → **Set up a custom domain**
2. **Domain**: `record.digicollabo.com` を入力 → **Continue**
3. Cloudflare が DNS 追加を提案 → **Activate domain**

画面の指示に従うと、Cloudflare は以下の DNS レコードを自動作成します(`digicollabo.com` ゾーンが同じアカウント内にある場合)。

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `record` | `digicollab-recorder.pages.dev` | **Proxied(オレンジ雲)** |

**既存の `record.digicollabo.com` レコードが別ゾーンや別アカウントにある場合**は手動で追加してください。

---

## 6. DNS 伝播 + SSL 証明書発行確認

- DNS: `nslookup record.digicollabo.com 1.1.1.1` や `dig record.digicollabo.com` で Cloudflare の IP(`104.21.x.x` 等)が返れば OK
- SSL: 通常は **5〜15 分**で自動発行。Custom domains 一覧で状態が **"Active"** になるまで待機
- Active になったら `https://record.digicollabo.com` を直接ブラウザで開く

**確認ポイント**:
- [ ] SSL 鍵マークが緑(または有効)で表示されている
- [ ] リダイレクトで `https://digicollabo.com/?return_to=...` にジャンプする
- [ ] ハブ側でログイン済みなら戻ってきて録画スタジオのホームが表示される

---

## 7. 初回動作確認(スモークテスト)

以下を一通り実行して動作を検証してください。**10 〜 15 分**。

### 7-1. 認証ゲート
1. シークレットウィンドウで `https://record.digicollabo.com` を開く
2. 自動的に `https://digicollabo.com/?return_to=...` にリダイレクトされることを確認
3. ハブでログイン → `record.digicollabo.com` に戻ることを確認

### 7-2. 台本 CRUD
1. ホーム → 「新しい台本」
2. タイトル「テスト」、本文を数行入力 → 「保存する」
3. `/script/<uuid>` にリダイレクト、ホームに戻ると一覧に表示されることを確認

### 7-3. AI 台本生成
1. 編集画面 → 「AI で下書きを作る」
2. テーマ「テスト」、長さ 1 分、フレンドリー → 「作る」
3. 生成結果が表示(または `site_settings.openai_api_key` 未設定なら案内メッセージ)

### 7-4. 録画 → アップロード
1. ホーム → 「録画する」 → 「自撮り」
2. カメラ許可ダイアログ → プレビュー表示 → 「録画を開始」
3. 3 秒カウントダウン → 10 秒ほど録画 → 「停止する」
4. 「アップロードする」 → 進捗バー 0→100% → 「準備中」に切り替わる
5. Webhook 到着(30 秒〜 2 分) → 「完了しました」 → ライブラリに自動遷移
6. ライブラリで録画が `ready` 状態で表示、`▼ 再生` 展開で再生できる

### 7-5. Bunny ダッシュボード
1. Bunny Stream → Library 643370 → Videos
2. アップロードした動画が存在、ステータスが Finished
3. 再生ボタンで再生可能

### 7-6. Webhook ログ
1. Supabase ダッシュボード → Edge Functions → `fb-bunny-webhook` → Logs
2. POST リクエストが 200 で返っている
3. アップロードした動画の `VideoGuid` がログに出ている

---

## 8. ロールバック手順

デプロイ後に問題が起きた場合:

1. Cloudflare Pages → Deployments → 直前の成功デプロイを選ぶ
2. **"..."** メニュー → **Rollback to this deployment**
3. 数秒で本番が前バージョンに戻る

または、ソース側でロールバックしたい場合:

```bash
git revert <commit-sha>
git push origin main
```

`main` に push した瞬間に Cloudflare Pages が再ビルド・再デプロイします(約 1 分)。

---

## 9. デプロイ後の継続運用

- `main` にマージ/push するたびに自動デプロイ
- PR の Preview デプロイは `pr-<number>.digicollab-recorder.pages.dev` で利用可能(feature flag 的に事前確認できる)
- ビルド失敗時は Cloudflare からメール通知(プロジェクト設定で有効化)

---

## 10. トラブルシューティング

### ビルドが `Module not found: tus-js-client` などで失敗する
- `package.json` に依存が入っているか確認
- Cloudflare Pages の Environment variables の `NODE_VERSION` を 20 に指定して試す(既定は 18.x だが、Vite 6 は 20 推奨)

### DNS が反映されない
- Cloudflare で CNAME が **Proxied(オレンジ雲)** になっているか
- ブラウザの DNS キャッシュを `chrome://net-internals/#dns` からクリア
- `dig +short record.digicollabo.com` で Cloudflare IP が返ることを確認(最大 30 分待つ)

### SSL Pending のまま変わらない
- 初回のみ 15〜30 分かかることがある
- それ以上待っても Pending なら、Custom domains で一度削除 → 再追加
- 別アカウントの Cloudflare が旧証明書を持っている場合は support 経由

### アップロードが 0% から進まない
- ブラウザの DevTools → Network で `POST video.bunnycdn.com/tusupload` のレスポンスを確認
- 401 なら `BUNNY_STREAM_API_KEY` 未設定 / 誤り
- 403 なら Allowed Domains に `record.digicollabo.com` が含まれているか確認

### Webhook が呼ばれず status が processing のまま
- Bunny ダッシュボードで動画のステータスは Finished になっているか
- Bunny → Webhook URL が正しい token 付きで登録されているか
- Supabase Edge Functions → `fb-bunny-webhook` → Logs で 401 / 403 / 500 が出ていないか

### SSO リダイレクトが無限ループする
- ハブ側の allowed apps リストに `record.digicollabo.com` が登録されていない可能性
- Phase 1.5 のタスクで登録作業を実施

---

## 11. 完了後の報告

デプロイ完了したら以下を Slack / チャットで共有:

- Production URL: `https://record.digicollabo.com`
- Cloudflare Pages の Deployments URL(ビルドログ確認用)
- 初回スモークテスト結果(§ 7 のチェックボックス)
- 動作確認した録画の `recording_id`(Supabase で確認できる)

これで Phase 1 の本番公開は完了です。次は **Phase 1.5(各テンプレート改修)** で、コース/VSL/オートウェビナー/サンクス/LINE/メール 各画面に「録画する」ボタンを追加する作業に進みます。
