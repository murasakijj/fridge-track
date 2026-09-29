# fridge-track(冷蔵庫在庫)

家庭の食材在庫を管理する個人用 Web アプリ。**現在在庫を直接更新せず**、購入・消費・廃棄・補正のイベントを蓄積し、その合計から在庫を算出する(Event Sourcing)。履歴から食材ごとの消費速度と推定精度も出す。

- 仕様: [fridge-track-design.md](./fridge-track-design.md)
- 設計決定・実装計画: [docs/implementation-plan.md](./docs/implementation-plan.md)
- API: [docs/api.md](./docs/api.md) / セットアップ: [docs/setup.md](./docs/setup.md)

## 機能

- 食材(管理単位つき)の登録、Lot 単位の在庫、FIFO 消費、廃棄、実在庫による補正(ADJUST)
- レシート撮影 → AI で購入候補を抽出 → 確認・修正 → 一括登録(確認前に在庫へ反映しない)
- レシピアプリ連携 API(`/api/recipe-consume`、冪等)
- 消費速度・推定精度・推定状態(在庫ゼロ期間を除外)

## 構成

React 19 + Vite + TypeScript / Firebase Auth(Google)+ Firestore / Vercel Functions(`api/`)。ドメインロジックは `shared/` の純粋関数(フロントと API で共用)。AI は `api/_lib/ai/` のプロバイダ抽象(Gemini / OpenAI / Anthropic)。

```
shared/   ドメインロジック(FIFO・補正・消費プロファイル・単位変換)とテスト
api/      Vercel Functions(auth-check, receipt-parse, food-items, recipe-consume)
src/      フロントエンド
firebase/ Firestore ルール(許可メールはプレースホルダ)
```

## 開発

```bash
npm install
cp .env.example .env.local   # Firebase の公開設定値を入れる
npm run dev                  # フロントのみ(/api は動かない。vercel dev なら動く)
npm run lint && npm test && npm run build
```

Firebase / Vercel / AI キーの設定は [docs/setup.md](./docs/setup.md)。
