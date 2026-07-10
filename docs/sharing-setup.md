# 共有機能のセットアップ (管理者向け)

シフト表の共有機能は、Vercel の **Blob ストレージ** に共有データを保存します。

## 現在の設定 (2026-07-11 設定済み)

- ストア: `shift-scheduler-shares` (Public / IAD1) — 共有データ専用
- プロジェクト `shift-scheduler` に **Production, Preview** 環境で接続済み
- 接続時のプレフィックス: `SHARE_BLOB` → 環境変数 `SHARE_BLOB_READ_WRITE_TOKEN` などが自動作成済み
- `api/share.js` は `SHARE_BLOB_READ_WRITE_TOKEN` を優先し、無ければ標準の `BLOB_READ_WRITE_TOKEN` を使う
- 備考: `shift-scheduler-blob` という空のストアも存在する (最初の作成時に
  トークン無しで自動接続されたもの)。未使用なので、気になる場合は
  Vercel の Storage 画面から削除してよい (`BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` も一緒に消える)

## ゼロから再設定する場合の手順

1. https://vercel.com にログインし、チームの **Storage** (All Databases) を開く
2. **Create Database** → **Blob** → Access は **Public** を選んで作成
3. 作成したストアの **Connect Project** で `shift-scheduler` を選択
4. **「Add a read-write token env var to this connection」に必ずチェック**
   (これを忘れると読み書きトークンが作られず、共有 API が動かない)
5. プレフィックスを変えた場合は `api/share.js` の `blobToken()` を合わせる
6. プロジェクトを **Redeploy** (main へのマージでも可)

ストア未設定のまま共有ボタンを押した場合は、アプリ内に
「共有ストレージが未設定です」というメッセージが表示されます (エラーで壊れることはありません)。

## 使い方

- **送る側**: シフト表画面の「🔗 共有」→ 表示されたリンクを LINE 等で送る
- **受け取る側**: リンクを開いて「この端末に取り込む」を押すだけ
  - リンクが開けない場合は、ホーム画面の「📥 共有コードで取り込む」に 8 文字のコードを入力
- 取り込むと受け取り側の端末のデータは共有内容に **置き換わります**
  (直前のデータは `shift-scheduler-data-import-backup` として localStorage に自動バックアップされます)
- 共有は「送った時点のコピー」です。共有後に修正したら、もう一度「共有」して新しいリンクを送ってください

## ローカル開発時の注意

`npm run dev` (Vite 単体) では `/api/share` が存在しないため、共有ボタンは通信エラーになります。
共有機能ごとローカルで動かす場合は `vercel dev` を使うか、`.env.local` に
`VITE_SHARE_API_BASE=<モックサーバーのURL>` を設定してください。

## データの扱いについて

- 共有データ (社員名・シフト) は Vercel Blob に保存されます
- URL・コードは推測困難なランダム 8 文字で、コードを知っている人だけが取得できます
- 有効期限は設けていません。不要になった共有データは Vercel ダッシュボードの Storage → Blob から削除できます
