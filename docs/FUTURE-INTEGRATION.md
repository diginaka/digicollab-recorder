# 将来の統合課題メモ

Phase 1 の運用開始後、**Phase 2 以降** で対応する予定の設計判断を残すドキュメント。
Phase 1 では意図的に実装しなかった領域を明示して、将来の議論の出発点にする。

---

## 1. Phase V1/V2 動画生成パイプラインとのライブラリ統合

### 現状

Supabase プロジェクト `whpqheywobndaeaikchh` には以下 2 系統の動画テーブルが共存している:

| テーブル | 担当 Phase | 用途 | キー列 |
|---|---|---|---|
| `public.fb_recordings` | **record Phase 1(本リポジトリ)** | ユーザーが自分のマイク/カメラで録画したアセット | `bunny_video_id`(uniq), `script_id`, `source_app`, `source_ref` |
| `public.fb_video_library` | **Phase V1/V2 動画生成パイプライン**(別リポジトリ) | AI による台本 → スライド → 合成動画 | `generation_job_id`, `bunny_video_id`, `storage_provider`, `storage_path` |

`fb_recordings` には Phase V1/V2 用の予備列 `business_profile_id`(uuid)と `r2_backup_path`(text)が既に存在し、record Phase 1 では **常時 NULL** のまま運用している。

### 横断表示が必要になるケース

- ユーザーが「自分の動画一覧」を見るときに AI 生成動画 + 手動録画を一緒に表示したい
- 特定の `business_profile` 配下の全動画(AI 生成 + 手動録画)をフィルタしたい
- Phase V1/V2 で AI 生成した動画の**台本から再録画**するワンクリック導線を提供したい

### 設計方針の候補

#### 候補 A: アプリ層マージ(推奨)

両 API を並行で叩き、結果を `created_at desc` でマージする。

```ts
// 疑似コード
const [recordings, library] = await Promise.all([
  listRecordings(),
  listVideoLibrary(),  // 新規 API
])
const merged = [...recordings.map(toItem), ...library.map(toItem)]
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
```

- 長所: DB スキーマに手を入れない / 片側が落ちても片側は動く
- 短所: ページング(offset/limit)が面倒、クライアント側で二重管理

#### 候補 B: Postgres VIEW

```sql
create view public.fb_all_videos as
  select id, user_id, business_profile_id, title, bunny_video_id,
         public_url, thumbnail_url, duration_seconds, 'recording' as source,
         created_at
  from public.fb_recordings where status = 'ready'
  union all
  select id, user_id, business_profile_id, title, bunny_video_id,
         null as public_url, thumbnail_url, duration_seconds, 'library' as source,
         created_at
  from public.fb_video_library;

-- RLS も VIEW に設定
```

- 長所: SQL 1 本で取れる / ページングが簡単
- 短所: スキーマ変更が両 phase 間の契約になる / VIEW の RLS 設計が追加作業

#### 候補 C: 新規統合テーブル

両テーブルから INSERT するトリガーで `fb_unified_video_assets` を維持。
- 長所: アプリ側が最小構成
- 短所: ダブルソースオブトゥルース、整合性管理が重い

### 判断タイミング

以下のトリガーで検討開始:

1. ユーザーから「AI 動画と手録画を一緒に見たい」という要望が出たとき
2. Phase V1/V2 側のライブラリ機能が先行して完成し、統合前提の UI を求めたとき
3. `business_profile` ごとのダッシュボード機能が要求されたとき

### 現時点で実装しない理由

- Phase 1 はユーザー自撮り録画の**単独完結**が最優先ゴール
- Phase V1/V2 は別チームが並行開発中で、統合 API の安定性が未確認
- `business_profile_id` のマルチテナント設計が Phase V1/V2 側で固まっていない
- アプリ層マージ(候補 A)であれば Phase 1 完成後のマイナーバージョンで追加可能

---

## 2. 録画削除時の Bunny Stream 側 orphan 対応

### 現状(Phase 1)

[src/routes/Library.tsx](../src/routes/Library.tsx) の「削除」ボタンは `fb_recordings` の DELETE のみ実施:

```ts
// src/lib/recordingsApi.ts
export async function deleteRecording(id: string): Promise<void> {
  const sb = client()
  const { error } = await sb.from('fb_recordings').delete().eq('id', id)
  if (error) throw error
}
```

**Bunny Stream 側の動画アセット(`bunny_video_id` 参照先)は残り続ける** = orphan。

### 影響

- Bunny Stream の **ストレージ課金**(GB ベース) + **配信課金**(転送量ベース)が残存動画に対して発生
- Bunny ダッシュボードに論理削除されたユーザーの動画も表示され、管理が煩雑

### 将来対応案

#### 案 1: Edge Function `fb-bunny-video-delete`

新規 Edge Function(`verify_jwt=true`)を追加し、Library の削除ボタンから呼び出す。

```ts
// 疑似コード
Deno.serve(async (req) => {
  const { recording_id } = await req.json()
  // 1. user auth + recording の所有者確認(RLS 依存 + service role で fetch)
  // 2. Bunny API DELETE https://video.bunnycdn.com/library/{libraryId}/videos/{videoGuid}
  //    Headers: { AccessKey: BUNNY_STREAM_API_KEY }
  // 3. fb_recordings の DELETE
  // 4. 両方成功時のみ 200
})
```

#### 案 2: バッチジョブ(cron)

日次で `fb_recordings` に存在しない `bunny_video_id` を Bunny ダッシュボード API でリストアップして DELETE。

- 長所: クライアント側の改修不要
- 短所: 遅延削除(最大 24 時間)、実装が重い

#### 案 3: Soft delete + サービス側で定期クリーンアップ

`fb_recordings.deleted_at` カラムを追加し、ユーザー操作では UPDATE のみ。定期 cron で 30 日以上前の soft-deleted を Bunny API DELETE + DB DELETE。

- 長所: ユーザーの「間違えて削除した」に復旧余地を残せる
- 短所: UI / API / DB すべてに影響、Phase 1 の設計を超える

### 判断タイミング

- **運用開始後 1 週間**: Bunny ダッシュボードで orphan の累積を観察
- orphan が月次で 10 本未満 → 放置(案 1 も不要)
- 月次で 10〜50 本 → **案 1(Edge Function)** を追加
- 月次で 50 本以上 → **案 3(soft delete + cron)** で設計見直し

### 現時点で実装しない理由

- Phase 1 のベータ運用段階では削除頻度が低く見込まれる
- Edge Function の追加 + Bunny API エラーハンドリング + UI 連携で約半日工数
- UI 上は「削除しました」と表示するだけでユーザー体験は同じ(orphan はユーザー非可視)
- Cloudflare R2 バックアップを併用する場合はそちらの削除連携も必要になり、設計が一気に複雑化する

---

## 3. その他の将来課題(サマリー)

### セッションポーリング活性化

[src/lib/digicollabSso.ts](../src/lib/digicollabSso.ts) に `startSessionPolling` を実装済みだが App.tsx から未使用。長時間録画中(30分〜)のセッション期限切れを検知する目的で、**Phase 1.5** で有効化を検討。

### HLS 再生のフォールバック

Library は現在 `mp4_url`(Bunny Direct Play)を直接 `<video>` に渡しているが、Bunny が将来 Direct Play を無効化した場合に備えて [hls.js](https://github.com/video-dev/hls.js) 組み込みを検討。現状は Bunny 側の Direct Play 有効を前提とする運用。

### モバイル端末で録画後のファイルサイズ上限

iOS Safari / Android Chrome では MediaRecorder が長時間録画で **数百 MB のメモリ**を消費する。UI 側で 10 分以上の録画は警告表示するオプションを Phase F 実機テスト後に検討。

### Phase V1/V2 TTS 戦略との統合

Phase V1/V2 は Gemini 3.1 Flash TTS を採用(別チャットで確定)。record Phase 1 はユーザー自身のマイクで録音するため TTS 未使用。両者の動画を横断表示する際(§ 1 の候補 A)、音声品質・言語設定の表示を統一するかは UX 議論待ち。

---

## 変更ログ

- 2026-04-23: 初版作成(Phase G デプロイ準備で生成)
