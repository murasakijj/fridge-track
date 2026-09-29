# fridge-track — Claude Code ガイド

## プロジェクト概要

家庭の食材在庫を、在庫変動イベント(購入・消費・廃棄・補正)の蓄積から算出して管理し、履歴から消費傾向を推定する個人用 Web アプリ。仕様は `fridge-track-design.md`（正）。

## 実装の進め方（重要）

**[docs/implementation-plan.md](../docs/implementation-plan.md) が設計決定と実装計画。フェーズを上から順に進める。** 設計とズレる実装をしたくなったら勝手に変えず、ユーザーに確認して docs を直してからコードを書く。

**最重要原則（仕様 §19）**: 現在在庫を直接更新しない。`InventoryEvent` が Source of Truth で、在庫は `quantity_delta` の合計から算出する。一般的な CRUD 在庫管理に簡略化しない。

- FoodItem / InventoryLot に数量を持たせない
- InventoryEvent は create のみ（update / delete 禁止）。訂正も差分イベントで残す
- 消費は FIFO（`shared/inventory.ts`）。補正は ADJUST（現在値の上書き禁止）
- ドメインロジックは `shared/`（フロントと `api/` の共用純粋関数）に置き、必ず vitest で単体テストする。`shared/` と `api/` の import は NodeNext のため `.js` 拡張子を付ける

## 技術スタック（確定）

- React 19 + Vite + TypeScript、react-router-dom、素の CSS（モバイルファースト）
- Firebase Authentication（Google）+ Cloud Firestore（`users/{uid}/…`、ルールは `firebase/firestore.rules`）
- Vercel（静的配信 + Functions `api/`）。`@vercel/node` は使わない（`api/_lib/types.ts`）
- zod、vitest、eslint、prettier。Node 22.x。`package.json` の `overrides.jose` を消さない

## 絶対に守るセキュリティルール

1. `FIREBASE_SERVICE_ACCOUNT` や AI の API キーをフロントに出さない（`VITE_` を付けない）
2. すべての `/api/*` は `requireAuth`（ID トークン検証 + `ALLOWED_EMAILS`）を通す（連携トークン認証は plan §6 の例外のみ）
3. Firestore ルールは本人のメール + uid 一致のみ許可。リポジトリには許可メールのプレースホルダ `you@example.com` だけを置く
4. 外部入力・AI 出力は zod などで検証する。AI/OCR の結果は確認なしに在庫へ反映しない
5. `dangerouslySetInnerHTML` を使わない

## コマンド

```
npm run dev     # フロント開発サーバー（/api は動かない）
npm run build   # tsc -b && vite build
npm test        # vitest run（src/, api/, shared/）
npm run lint
```

`prettier --write .` はリポジトリ全体に走らせない（仕様書・docs を整形してしまう）。対象ディレクトリを指定する。
