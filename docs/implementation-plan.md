# fridge-track 実装計画 / 設計決定

仕様の正は [`fridge-track-design.md`](../fridge-track-design.md)（以下「仕様」）。本書は仕様の未決事項の決定と実装計画。
認証・AI 呼び出し・Vercel 構成は `murasakijj/recipe-buddy` の実績実装を踏襲する。

## 1. 技術スタック（recipe-buddy と同じ）

- React 19 + Vite + TypeScript、react-router-dom v7、素の CSS（モバイルファースト）
- Firebase Authentication（Google, `signInWithPopup`）+ Cloud Firestore（firebase v12 modular SDK）
- Vercel（静的配信 + Functions `api/`）。firebase-admin で ID トークン検証。`@vercel/node` は使わない（`api/_lib/types.ts` の最小型）
- zod（API ボディ・AI 出力検証）、vitest、eslint、prettier
- Node 22.x。`package.json` の `overrides: { "jose": "^4.15.5" }` を必ず入れる（Vercel で `ERR_REQUIRE_ESM` 回避）
- Firebase Storage は使わない（無料枠外）。レシート画像は保存しない（`Receipt.image_reference` は `null`）

## 2. 認証・認可（利用者を本人 1 名に限定）

recipe-buddy の以下をほぼそのまま移植する:
`api/_lib/auth.ts`（`requireAuth`: ID トークン検証 + `ALLOWED_EMAILS` 照合）、`api/_lib/http.ts`、`api/_lib/types.ts`、`api/auth-check.ts`、
`src/lib/firebase.ts`、`src/lib/apiClient.ts`、`src/contexts/AuthContext.tsx`（+ `auth-context.ts`, `useAuth.ts`）、`src/components/RequireAuth.tsx`、`src/pages/Login.tsx`。

三重の防御:
1. `/api/auth-check` が 403 を返したらクライアントは即 `signOut`（UI 上の締め出し）
2. すべての `/api/*` は `requireAuth` を通す（例外は §6 の連携 API の「連携トークン」認証のみ）
3. Firestore ルールで `request.auth.token.email in [許可メール]` かつ `uid` 一致を要求（[`firebase/firestore.rules`](../firebase/firestore.rules)）

許可メールは `ALLOWED_EMAILS`（Vercel 環境変数）と Firestore ルール（Console に貼るときに置換）で設定する。リポジトリにはプレースホルダ `you@example.com` のみを置く。

## 3. Firestore データモデル

すべて `users/{uid}/` 配下。フィールド名は仕様 §12 に合わせ snake_case。日時は Firestore `Timestamp`。

| コレクション | 内容 | 更新ルール |
| --- | --- | --- |
| `foodItems/{id}` | `name`, `base_unit`, `created_at`, `updated_at` | create / update 可。**`base_unit` は変更不可**（ルールで強制）。delete 不可 |
| `inventoryLots/{id}` | `food_item_id`, `purchased_at`, `created_at`, `updated_at` | create のみ。数量は持たない |
| `inventoryEvents/{id}` | `inventory_lot_id`, `food_item_id`, `event_type`, `quantity_delta`, `source_type`, `source_id`(nullable), `occurred_at`, `created_at`, `note`(任意) | **create のみ（update/delete 禁止）**。追記専用 |
| `receipts/{id}` | `image_reference`(null), `purchased_at`, `created_at` | create のみ |
| `receiptItems/{id}` | `receipt_id`, `raw_name`, `food_item_id`, `quantity`, `unit`, `confirmed` | create のみ |
| `receiptFoodMappings/{id}` | `raw_name`(正規化済みをキー), `food_item_id`, `created_at`, `updated_at` | create / update。doc id = 正規化 raw_name のハッシュ等で upsert |
| `consumptionProfiles/{foodItemId}` | `consumption_rate`(base_unit/日), `observation_count`, `confidence_score`(0..1), `calculated_at` | 派生データ。イベント書込み後にクライアントが再計算して set。削除可 |
| `recipeConsumptions/{cookingEventId}` | 連携 API の冪等性キー。`recipe_id`, `created_at`, `event_ids` | サーバー（admin）のみ書込み |

- `event_type`: `PURCHASE | CONSUME | DISCARD | ADJUST`。`source_type`: `MANUAL | RECIPE | RECEIPT | SYSTEM`
- 符号: PURCHASE は正、CONSUME/DISCARD は負、ADJUST は正負どちらも。0 のイベントは作らない
- **現在在庫はイベントの合計からのみ算出**（仕様 §13）。FoodItem / Lot に数量キャッシュを置かない
- 数値は浮動小数の誤差対策として小数第 3 位で丸める（`roundQty`）。残量が `|x| < 0.0005` は 0 とみなす

## 4. 単位

- `base_unit` 候補（SC-03 で選択。自由入力も可）: `個`, `g`, `ml`, `%`, `切`, `本`, `枚`, `パック`, `袋`
- 在庫操作の数量は常に `base_unit` で入力・保存する（SC-04 の「単位」は base_unit を表示するだけ）
- 連携 API / レシート確定時の単位変換（`shared/units.ts`）:
  - 同一単位 → そのまま / `kg→g ×1000`, `L→ml ×1000`
  - `base_unit === "%"` のとき: 曖昧表現と分数袋を % に変換（仕様 §5）。既定値は `shared/ambiguous.ts` の定数表:
    `少々=1`, `適量=3`, `少量=3`, `ひとつまみ=1`, `1/4袋=25`, `1/2袋=50`, `1袋=100`, `N袋=N*100`, `N本=N*100`, `N個=N*100`（容器単位） — 表は後で設定化できるよう 1 か所にまとめる
  - 変換不能 → その明細はエラー（連携 API では `unit_mismatch` として返し、他の明細は処理する）

## 5. ドメインロジック（`shared/` — クライアントと API で共用する純粋関数。必ず単体テストする）

- `lotBalances(events)` → `Map<lotId, qty>`、`foodTotal(...)` → 合算（仕様 §13）
- `planFifo(lots, events, amount)` → `{ allocations: [{lotId, delta}], shortage }`（仕様 §14）。残量 > 0 の Lot を `purchased_at` 昇順（同時刻は `created_at`、次に id）で消費。在庫不足分は記録せず `shortage` として返す
- `planAdjust(lots, events, actualTotal)` → 差分 `diff = actual - current`。`diff < 0` は FIFO で各 Lot に負の ADJUST、`diff > 0` は最新 Lot に正の ADJUST。Lot が 1 つもない（または全 Lot を使い切っていても）で `diff > 0` の場合は **新規 Lot を作成しその Lot に ADJUST** を付ける（PURCHASE は作らない）
- DISCARD: Lot 指定（その Lot の残量全部 or 指定量、上限は残量）と FoodItem 指定（FIFO）の 2 通り
- `computeConsumptionProfile(foodEvents, now)`（仕様 §9）:
  - 時系列にイベントを並べ、合計在庫が > 0 の期間の長さ（日）を `stockedDays` として積算（在庫ゼロ期間を除外、仕様 §9.3）。最後のイベント〜`now` も在庫 > 0 なら含める
  - 消費量 `used = Σ(-CONSUME) + Σ(-負のADJUST) - Σ(正のADJUST)`（DISCARD は消費に含めない。未記録消費は負の ADJUST として現れるため含める）。`used < 0` は 0
  - `consumption_rate = stockedDays >= 1 ? used / stockedDays : 0`（base_unit/日）
  - `observation_count` = CONSUME + ADJUST イベント数
  - `confidence_score = min(1, observation_count / 20) * min(1, stockedDays / 30)`。ラベル: `≥0.6 高 / ≥0.25 中 / それ未満 低`（学習中モードで機能を止めない、仕様 §9.4）
- `estimateState(total, rate, lastCheckAt, now, unit)` → 一覧の「推定状態」:
  - `total <= 0` → `在庫なし`
  - `rate > 0` かつ `推定残量 = total - rate * 経過日数(最後の PURCHASE/ADJUST から)` が `<= 0` → `なくなっている可能性あり`
  - `rate > 0` かつ `推定残日数 = 推定残量 / rate <= 2` → `残り少ない`、`<= 5` → `そろそろ減っている可能性あり`
  - それ以外 → `十分`。rate = 0 のときは記録値のみで判定（`%` 単位で 20 以下なら `残り少ない`）
  - 表示は「記録上の在庫」と「推定」を分けて出す（推定値と信頼度を分離、仕様 §9.4）

## 6. API（Vercel Functions）

すべて `requireAuth` 必須（`/api/recipe-consume` と `/api/food-items` のみ連携トークンも可）。エラーは `{ error: code }` JSON。

| エンドポイント | 用途 |
| --- | --- |
| `GET /api/auth-check` | 許可判定（recipe-buddy と同一） |
| `POST /api/receipt-parse` | body `{ image: { mimeType, data(base64) }, foodItems: [{id,name,base_unit}] }` → AI でレシート解析し `{ purchased_at?, items: [{ raw_name, food_item_id \| null, quantity, unit }] }` を返す。**書き込みはしない**（確定はユーザー確認後にクライアントが行う、仕様 §8.3）。AI 出力は zod 検証し、存在しない food_item_id は null に落とす。画像は ≤ 4MB（クライアントで長辺 1600px の JPEG に縮小して送る） |
| `GET /api/food-items` | 連携用。FoodItem 一覧 `{ id, name, base_unit }`（レシピアプリが材料を food_item_id に紐づけるため） |
| `POST /api/recipe-consume` | レシピアプリ連携（仕様 §7, §15.4）。body `{ recipe_id, cooking_event_id, items: [{ food_item_id, quantity, unit }] }`。firebase-admin の Firestore トランザクション内で FIFO（`shared/fifo.ts`）を実行し `source_type: RECIPE`, `source_id: cooking_event_id` の CONSUME を作る。`recipeConsumptions/{cooking_event_id}` で冪等（再送は前回結果を返す）。応答 `{ results: [{ food_item_id, consumed, shortage, error? }] }` |

連携 API の認証: `Authorization: Bearer <token>` が
(a) Firebase ID トークン（`requireAuth` 成功）なら その uid、
(b) `RECIPE_INTEGRATION_TOKEN`（Vercel 環境変数、32 文字以上。未設定ならこの経路は無効）と定数時間比較で一致すれば `INVENTORY_OWNER_UID` の uid
としてデータにアクセスする。レシピアプリ側の改修は本リポジトリの範囲外（API 仕様を `docs/api.md` に書く）。

## 7. 生成 AI 抽象化（どの AI でも呼べる）

`api/_lib/ai/`:
- `types.ts`: `interface AiProvider { name; generateJson(req: { system?: string; prompt: string; images?: {mimeType,data}[]; jsonSchema: object; signal }): Promise<unknown> }`、`AiProviderError`
- `gemini.ts`（`@google/genai`, `responseMimeType: application/json` + `responseJsonSchema`）— **既定**。recipe-buddy `api/_lib/ai.ts` のリトライ/デッドライン（429/503 のみ最大 3 回、全体 50 秒）を共通ラッパー `retry.ts` として移植
- `openai.ts`（fetch で Chat Completions、OpenAI 互換。`AI_BASE_URL` で互換サーバーも可）、`anthropic.ts`（fetch で Messages API）— SDK は入れない
- `index.ts`: `getAiProvider()` が `AI_PROVIDER`（`gemini`|`openai`|`anthropic`、既定 `gemini`）と `AI_MODEL`（既定: gemini=`gemini-3.6-flash`）、各 API キー（`GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`）を読む
- 呼び出し側（`api/_lib/receipt/`）はプロバイダに依存しない。出力は必ず zod 検証
- 新しいプロバイダは `AiProvider` を 1 ファイル実装して `index.ts` に登録するだけで追加できる

## 8. 画面（仕様 §10, §11。スマホ第一）

| ルート | 画面 |
| --- | --- |
| `/login` | ログイン |
| `/` | SC-01 食材一覧（名前・合計在庫+単位・推定状態・精度ラベル。検索、在庫あり/なし並び。各行からワンタップで詳細） |
| `/foods/new` | SC-03 食材登録（名前・管理単位。同名重複は警告） |
| `/foods/:id` | SC-02 食材詳細（合計・ロット一覧(残量>0、使い切りは折りたたみ)・イベント種別ごとの履歴・消費速度・精度・観測数）。ここから追加/消費/補正/廃棄 |
| `/foods/:id/add` | SC-04 在庫追加（数量、購入日(既定今日)）→ 新規 Lot + PURCHASE(MANUAL) |
| `/foods/:id/consume` | 手動消費（数量 → FIFO で CONSUME(MANUAL)。不足分は警告表示） |
| `/foods/:id/adjust` | SC-05 在庫補正（「今実際にいくつあるか」を入力。`%` 単位はスライダー + 0/25/50/75/100 ボタンで数タップ完了）→ ADJUST |
| `/foods/:id/discard` | SC-06 廃棄（Lot 選択 or 量指定 FIFO）→ DISCARD |
| `/receipt` | SC-07 レシート読み込み（撮影/選択 → 解析 → 各行: 商品名・FoodItem 選択（保存済みマッピングを優先適用、無ければ AI 候補、新規 FoodItem 作成も可）・数量・除外チェック → 一括確定で Receipt/ReceiptItem/Lot/PURCHASE(RECEIPT)/マッピング upsert を 1 つの writeBatch で） |
| `/history` | SC-08 履歴（時系列、種別フィルタ、食材名表示） |

- データ取得は `users/{uid}` 配下の foodItems / inventoryLots / inventoryEvents を `onSnapshot` で購読する Provider（個人利用規模なので全件購読でよい）
- 書込みは `writeBatch` で Lot 作成とイベント作成をまとめる。イベント書込み後、該当 FoodItem の `consumptionProfiles` を再計算して set
- `dangerouslySetInnerHTML` 禁止

## 9. フェーズ

- **Phase 1**: 雛形（recipe-buddy からツール設定を移植）、認証一式、`shared/` ドメインロジック + テスト、Firestore ルール、データ層、SC-01〜06・手動消費・SC-08、消費プロファイル表示
- **Phase 2**: AI 抽象化 + `/api/receipt-parse` + SC-07、`/api/food-items`・`/api/recipe-consume`（admin トランザクション + 冪等）、docs（`docs/api.md`, `docs/setup.md`）、README
- 各フェーズ完了条件: `npm run lint && npm test && npm run build` がすべて成功

## 10. 環境変数

| 変数 | 場所 | 用途 |
| --- | --- | --- |
| `VITE_FIREBASE_*`（6 個） | Vercel / `.env.local` | 公開設定値 |
| `FIREBASE_SERVICE_ACCOUNT` | Vercel | firebase-admin（1 行 JSON） |
| `ALLOWED_EMAILS` | Vercel | 利用許可メール（本人のみ） |
| `AI_PROVIDER` / `AI_MODEL` | Vercel | 既定 `gemini` / `gemini-3.6-flash` |
| `GEMINI_API_KEY`（/ `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `AI_BASE_URL`） | Vercel | AI キー。`VITE_` を付けない |
| `RECIPE_INTEGRATION_TOKEN` / `INVENTORY_OWNER_UID` | Vercel | レシピアプリ連携（任意） |
