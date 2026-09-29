# API 仕様(Vercel Functions)

すべて `Authorization: Bearer <token>` 必須。エラーは `{ "error": "<code>" }` の JSON。
実装は `api/` 配下、共通ロジックは `api/_lib/` と `shared/`。

## 認証

| 方式 | 使えるエンドポイント | 内容 |
| --- | --- | --- |
| Firebase ID トークン | すべて | `requireAuth`: トークン検証 + `email_verified` + サインイン方法が `google.com` + `ALLOWED_EMAILS` 照合(いずれか欠ければ 403) |
| 連携トークン | `/api/food-items`, `/api/recipe-consume` のみ | `RECIPE_INTEGRATION_TOKEN`(32 文字以上)と定数時間比較で一致すれば、`INVENTORY_OWNER_UID` の uid として動く。環境変数が未設定/短すぎる場合、この経路は無効 |

共通エラー: `401 missing_token | invalid_token`、`403 forbidden`、`405 method_not_allowed`、`400 invalid_body`(zod 検証失敗)、`500 internal_error`(設定ミス・想定外)。

## GET /api/auth-check

ID トークンの許可判定。`200 { "ok": true }`。クライアントは 403 を受けたら即サインアウトする。

## POST /api/receipt-parse

レシート画像を解析して購入食材の候補を返す。**何も書き込まない**(登録は、ユーザーが確認した後にクライアントが Firestore へ書く)。ID トークンのみ。

リクエスト:

```json
{
  "image": { "mimeType": "image/jpeg", "data": "<base64 (data: 接頭辞なし)>" },
  "foodItems": [{ "id": "abc", "name": "豚肩ロース", "base_unit": "g" }]
}
```

- `mimeType`: `image/jpeg | image/png | image/webp`。`data` は base64 で 4MB(文字数)以下(クライアントは長辺 1600px の JPEG に縮小し、約 3.5M 文字を超えないようにする)。Vercel のボディ上限(約 4.5MB)を超えると JSON でない `413` が返り、UI は「画像が大きすぎます」と表示する
- `foodItems`: AI が `food_item_id` を提案するための候補リスト。500 件を超える分はサーバーが切り詰める(拒否しない)。クライアントも名前順の先頭 500 件だけ送る

レスポンス `200`:

```json
{
  "purchased_at": "2026-09-20",
  "items": [
    { "raw_name": "国産豚カタロース", "food_item_id": "abc", "quantity": 300, "unit": "g" },
    { "raw_name": "長ネギ", "food_item_id": null, "quantity": 1, "unit": "個" }
  ]
}
```

- `purchased_at` は読み取れたときだけ含む(`YYYY-MM-DD`)
- AI 出力は zod で検証済み。不正な明細は捨て、渡していない `food_item_id` は `null` に置き換える。明細は最大 100 件

エラー: `502 rate_limited`(429)、`502 overloaded`(503)、`502 upstream_error`(その他の上流エラー・タイムアウト)、`502 invalid_ai_output`(AI 出力がスキーマに合わない)。429/503 は自動で最大 2 回再試行(全体 50 秒で打ち切り)。`maxDuration` は 60 秒。

## GET /api/food-items

連携用の食材一覧。ID トークンまたは連携トークン。

`200 { "items": [{ "id": "abc", "name": "豚肩ロース", "base_unit": "g" }] }`(名前順)

レシピアプリはこれで材料を `food_item_id` に紐づける。

## POST /api/recipe-consume

料理完了時の食材消費を記録する(仕様 §7, §15.4)。ID トークンまたは連携トークン。

リクエスト:

```json
{
  "recipe_id": "recipe-123",
  "cooking_event_id": "cook-2026-09-29-001",
  "items": [
    { "food_item_id": "abc", "quantity": 250, "unit": "g" },
    { "food_item_id": "def", "quantity": 3, "unit": "%" }
  ]
}
```

- `cooking_event_id`: 冪等性キー(`[A-Za-z0-9_.:-]{1,200}`)。レシピアプリ側で「料理完了」1 回ごとに 1 つ発行して固定する
- `items`: 1〜100 件。`quantity > 0`

処理(1 つの Firestore トランザクション):

1. `recipeConsumptions/{cooking_event_id}` があれば**何も書かず前回の結果を返す**(`replayed: true`)。この記録は **CONSUME を 1 件以上書いたときだけ**残る(下記)
2. 各明細を食材の `base_unit` に単位変換(`shared/units.ts`。同一単位、`kg→g`、`L→ml`、`base_unit` が `%` のときは 少々=1 / 適量・少量=3 / ひとつまみ=1 / N袋・N本・N個=N×100 / 1/2袋=50 など)
3. FIFO(古い Lot から)で `CONSUME`(`source_type: RECIPE`, `source_id: cooking_event_id`, `note: recipe:<recipe_id>`)を Lot ごとに作成
4. `consumptionProfiles` を再計算し、`recipeConsumptions` に結果を保存

レスポンス `200`:

```json
{
  "results": [
    { "food_item_id": "abc", "consumed": 250, "shortage": 0 },
    { "food_item_id": "def", "consumed": 0, "shortage": 0, "error": "unit_mismatch" }
  ],
  "replayed": false
}
```

- `consumed`: base_unit で実際に記録した量。`shortage`: 在庫不足で記録しなかった量(在庫を負にはしない)
- 明細ごとの `error`: `not_found`(その食材がない)/ `unit_mismatch`(単位を変換できない)。エラーの明細があっても他の明細は処理される(HTTP は 200)
- 同じ食材が複数行あっても、先行行の消費を踏まえて FIFO する

### curl 例

```bash
curl -sS -X POST https://<your-app>.vercel.app/api/recipe-consume \
  -H "Authorization: Bearer $RECIPE_INTEGRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipe_id": "recipe-123",
    "cooking_event_id": "cook-2026-09-29-001",
    "items": [
      { "food_item_id": "<FOOD_ITEM_ID>", "quantity": 250, "unit": "g" }
    ]
  }'
```

同じコマンドを再実行しても在庫は二重に減らず、`"replayed": true` で最初の結果が返る。

**冪等性の記録は「実際に在庫を減らしたときだけ」残る。** 全明細が `not_found` / `unit_mismatch` になった、または在庫ゼロで 1 件も記録されなかった場合は何も保存しない(HTTP 200・`replayed: false` で結果は返る)。呼び出し側は紐づけや単位を直したうえで、**同じ `cooking_event_id` のまま再送**できる。1 件でも記録されたら、以降の再送は前回結果の再生になる(残りの明細だけ後から足すことはできないので、その場合は新しい `cooking_event_id` を使う)。

### recipe-buddy からの呼び出し方

recipe-buddy は Vercel Functions(サーバー側)から呼ぶこと。連携トークンをブラウザに置かない。

1. recipe-buddy の Vercel 環境変数に `FRIDGE_TRACK_URL` と、本アプリと同じ値の `RECIPE_INTEGRATION_TOKEN` を設定する(`VITE_` を付けない)
2. 材料の紐づけ: `GET {FRIDGE_TRACK_URL}/api/food-items` で一覧を取り、材料名 → `food_item_id` の対応をレシピ側に保存する
3. 料理完了時: 完了ごとに `cooking_event_id` を 1 つ決め(例: 調理記録のドキュメント ID)、紐づけ済みの材料だけを `items` にして `POST /api/recipe-consume`。ネットワークエラー時は**同じ `cooking_event_id` のまま**再送してよい(冪等)
4. `results` の `shortage` / `error` は必要ならレシピ側 UI に警告として出す。在庫アプリ側は在庫が足りなくても失敗にしない

レシピアプリ側の改修は本リポジトリの範囲外。
