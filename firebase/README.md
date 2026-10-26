# firebase/

**Firestore のセキュリティルール・インデックスの正本は household-chore-manager リポジトリの `firebase/` にある。このリポジトリからはデプロイしない。**

Firebase は household-chore-manager・money-lens・recipe-buddy・fridge-track の4アプリで1つのプロジェクト（共有プロジェクト）を使っている。1つのプロジェクトに適用できるルールは1つだけなので、このリポジトリから単独のルールをデプロイすると、他アプリのルールが消えて動かなくなる（またはルールが緩むおそれがある）。ルール・インデックスを変えたいときは household-chore-manager の `firebase/` を編集してそちらからデプロイすること。

経緯と切り替え手順は household-chore-manager の `docs/firebase-consolidation.md` を参照。

## このアプリが使うコレクション

クライアント（Firebase SDK）から直接読み書きする（連携 API はサーバー側から Firestore に書く）。すべて本人の uid 配下のみ。

| パス | 備考 |
| --- | --- |
| `users/{uid}/foodItems/{id}` | 食材マスター。`base_unit`・`created_at` は変更不可、delete 不可 |
| `users/{uid}/inventoryLots/{id}` | 在庫ロット |
| `users/{uid}/inventoryEvents/{id}` | 在庫変動イベント。追記専用（create のみ。update / delete 不可） |
| `users/{uid}/receipts/{id}` | レシート |
| `users/{uid}/receiptItems/{id}` | レシート明細 |
| `users/{uid}/receiptFoodMappings/{id}` | レシート品名と食材の対応 |
| `users/{uid}/consumptionProfiles/{foodItemId}` | 消費傾向プロファイル |
| `users/{uid}/recipeConsumptions/{id}` | recipe-buddy 連携の消費記録。サーバー(連携 API)のみ書き込み、クライアントは読み取りのみ |

各コレクションの許可・拒否の詳細（特に `inventoryEvents` の追記専用制約と、許可キー・符号条件）は、household-chore-manager の統合ルールの fridge-track セクションが正本。ドキュメントの形を変えるとき（`foodItems.category` の追加のように許可キーが変わるとき）は、先にそちらのルールを更新してデプロイすること。
