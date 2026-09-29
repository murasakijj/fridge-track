# セットアップ手順

個人利用(許可メール 1 名)を前提にした手動設定の手順。**自分のメールアドレスをリポジトリにコミットしないこと**(ルールファイルは `you@example.com` のプレースホルダのまま、Console 上でだけ置き換える)。

## 1. Firebase プロジェクト

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成(Google アナリティクスは不要)
2. **ウェブアプリを追加**(`</>`)し、表示される設定値を控える → `.env.local`(ローカル)と Vercel の環境変数に `VITE_FIREBASE_*` 6 個として設定(`.env.example` 参照)
3. **Authentication** > ログイン方法: **Google のみ**を有効化(他のプロバイダは有効にしない)
4. Authentication > 設定 > **承認済みドメイン**: `localhost`(既定)と、デプロイ先のドメイン(`<project>.vercel.app` やカスタムドメイン)を追加
5. **Firestore Database** を作成(本番モード。リージョンは近い場所)
6. **ルールを設定**: `firebase/firestore.rules` の内容を Firestore > ルール に貼り、`['you@example.com']` を**自分のメールアドレス**に置き換えて公開
   - 本人の uid・検証済み Google アカウント以外は全拒否。`inventoryEvents` は追記専用(update/delete 不可)、`foodItems.base_unit` は変更不可
7. **サービスアカウント**: プロジェクトの設定 > サービスアカウント > 新しい秘密鍵を生成。ダウンロードした JSON を**1 行に整形**して Vercel の `FIREBASE_SERVICE_ACCOUNT` に貼る(例: `jq -c . key.json`)。JSON ファイルはリポジトリに置かない
8. Firebase Storage は使わない(レシート画像は保存しない)

## 2. 生成 AI(レシート解析)

既定は Gemini(無料枠あり)。

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを作成(無料枠)
2. Vercel の環境変数 `GEMINI_API_KEY` に設定(`VITE_` を付けない)
3. モデルは既定 `gemini-3.6-flash`。変えたい場合は `AI_MODEL`

### プロバイダの切り替え

環境変数だけで切り替えられる(コード変更不要)。

| `AI_PROVIDER` | 必要なキー | 備考 |
| --- | --- | --- |
| `gemini`(既定) | `GEMINI_API_KEY` | |
| `openai` | `OPENAI_API_KEY` と **`AI_MODEL`(必須)** | 既定モデルは置いていない。画像入力と構造化出力(json_schema)に対応したモデルを指定する。未設定だと API は 500 `internal_error`(サーバーログに `AI_MODEL is required when AI_PROVIDER=openai`)。`AI_BASE_URL` で OpenAI 互換サーバーも可 |
| `anthropic` | `ANTHROPIC_API_KEY` | 既定モデル `claude-sonnet-5-5` |

`AI_MODEL` でモデルを上書きできる(openai のみ必須)。いずれも画像入力に対応したモデルを指定すること。新しいプロバイダは `api/_lib/ai/` に `AiProvider` 実装を 1 ファイル足し、`index.ts` に登録するだけ。

## 3. Vercel

1. このリポジトリを Vercel に **Import**(Framework: Vite、Build: `npm run build`、Output: `dist`。Node は 22.x)
2. 環境変数(Production / Preview):

| 変数 | 内容 |
| --- | --- |
| `VITE_FIREBASE_*`(6 個) | 手順 1-2 の公開設定値 |
| `FIREBASE_SERVICE_ACCOUNT` | 手順 1-7 の 1 行 JSON |
| `ALLOWED_EMAILS` | 自分のメールアドレス(カンマ区切りで複数可だが本人のみにする) |
| `GEMINI_API_KEY`(または他プロバイダのキー)、`AI_PROVIDER`、`AI_MODEL` | 手順 2 |
| `RECIPE_INTEGRATION_TOKEN`、`INVENTORY_OWNER_UID` | 任意。手順 4 |

3. デプロイ後、承認済みドメイン(手順 1-4)にデプロイ先を追加し忘れていないか確認 → ブラウザでログイン

ローカルで `/api/*` も動かすときは `vercel dev`(環境変数は Vercel から `vercel env pull`。`.env.local` は git 管理外)。`npm run dev` だけではフロントのみで API は動かない。

## 4. レシピアプリ連携(任意)

連携トークンは、ID トークンを持てないサーバー間呼び出し(recipe-buddy の Functions)のための共有シークレット。

1. `RECIPE_INTEGRATION_TOKEN` を生成(32 文字以上):

   ```bash
   openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48
   ```

2. `INVENTORY_OWNER_UID` を調べる: Firebase Console > Authentication > ユーザー で、自分のアカウントの **User UID** をコピー(在庫データは `users/{uid}/…` に入る)
3. 両方を本アプリの Vercel 環境変数に設定し、同じ `RECIPE_INTEGRATION_TOKEN` を recipe-buddy 側のサーバー環境変数にも設定
4. 呼び出し方は [api.md](./api.md) の recipe-consume を参照

`RECIPE_INTEGRATION_TOKEN` が未設定(または 32 文字未満)だと連携トークン認証は無効で、ID トークン認証のみになる。トークンが設定されていて `INVENTORY_OWNER_UID` が未設定の場合は、トークン付きのリクエストが **500 `internal_error`** になる(設定ミスを見逃さないよう意図的にエラーにしている。サーバーログに `INVENTORY_OWNER_UID is not set`)。トークンを漏らした場合は値を再生成して両方の環境を更新する。

## 5. 動作確認チェックリスト

- ログインできる(別の Google アカウントだと「アクセス権がありません」になる)
- 食材を登録 → 在庫追加 → 消費 → 履歴に出る
- `/receipt` でレシート画像を読み込み、確認画面が出る(確定するまで在庫は増えない)
- (連携する場合)`curl` で `/api/food-items` が返る
