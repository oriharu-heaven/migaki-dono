# ミガキ殿 — Webプロトタイプ v0.1

歯磨き中に音声で問いかけ、5段階の扇インターフェースで答える気分・体調チェックイン。
仕様書 `migaki-dono-spec.md` の実装。

## 動かす

```bash
npm install
npm run dev
```

深掘りパート（AI生成）を使う場合は、`.env` に APIキーを置く。

```bash
cp .env.example .env   # GEMINI_API_KEY を記入
```

キーは [Google AI Studio](https://aistudio.google.com/apikey) で取れる（無料枠あり）。

キーが無くても動く。生成が失敗すると §7.6 のフォールバック
（`public/data/fallback-questions.json`）に切り替わり、
画面に「つながらぬ。用意した問いで続ける」と出る。

## 生成API

既定は **Gemini**（`gemini-3.5-flash-lite`）。`GEMINI_API_KEY` が無く
`ANTHROPIC_API_KEY` があれば Anthropic に切り替わる。

| ファイル | 役割 |
|---------|------|
| `api/_core.ts` | 中継の実装。プロンプト組み立て（§7.5）と両プロバイダの呼び分け |
| `api/generate.ts` | Vercel Serverless Function のエントリ |
| `functions/api/generate.ts` | Cloudflare Pages Functions のエントリ |

**サーバ側はこれだけで、データは一切保存しない。**
公開URLで配るため、`Origin` が自分のホストと一致しないリクエストは 403 で弾く
（キーは露出しないが、放置すると第三者に生成枠を使われるため）。

構造化出力（`response_format` + スキーマ）でカテゴリを §7.4 の固定語彙に enum で
縛っている。それでも生成文はクライアント側で再検証し、禁止語を含めば
フォールバックに切り替える（§7.7）。

## 配布

ビルドコマンドは `npm run build`、出力は `dist`。Vercel / Cloudflare Pages の
どちらでもそのまま載る。環境変数 `GEMINI_API_KEY` をホスト側に設定すること。

配布はURLのみ。テスト参加者には「ホーム画面に追加してから使う」よう案内すること
（未追加だと Safari のストレージポリシーで IndexedDB が破棄されうる。§8）。

## 質問文の差し替え

固定パートと、フォールバック用の深掘りプールは JSON で外出ししてある。
ビルドし直さずに編集できる。

- `public/data/fixed-questions.json` — 朝夜それぞれの固定3問（§7.1 / §7.2）
- `public/data/fallback-questions.json` — 生成失敗時のプール（§7.6）

## 検証中に見るもの

設定画面の下部に §12 の検証指標（完了率・平均レイテンシ・訂正率・無回答率・
スワイプ選択率・平均問数・平均歯磨き時間）が出る。訂正率が15%を超えると
3段階への切替を促す警告が出る（§6.3）。

記録は端末内の IndexedDB にしかない。**週1回はCSVを書き出して控えを取ること**（§8）。
履歴画面の右上「書き出す」から、1行=1回答のCSVが落ちる。

## 実装フェーズ（§11）との対応

| Phase | 状態 |
|-------|------|
| 1 骨格（S-1/S-2/S-3、固定パート、IndexedDB） | 実装済み。縦ボタンUIは設定で切替可能 |
| 1.5 扇インターフェース | 実装済み。タップ／スワイプ、開閉アニメーション、利き手切替 |
| 2 音声とタイマー | 実装済み。`voiceschanged` 待機、読み上げ後の入力受付、Wake Lock |
| 3 PWAと履歴 | 実装済み。Service Worker、マニフェスト、サマリ、CSV |
| 4 AI深掘り | 実装済み。第1層/第2層の先読み、時間ベース終了、フォールバック、カテゴリ推定 |
| 5 検証用オプション | 実装済み。画面OFFモード、外部ボタン、3段階切替 |

## 仕様からの逸脱

- **生成API**: 仕様は Anthropic Messages API（`claude-sonnet-4-6`）を指定しているが、
  既定を **Gemini**（`gemini-3.5-flash-lite`）に変更した。Anthropic も
  `ANTHROPIC_API_KEY` を置けば使える。仕様が指定していた `claude-sonnet-4-6` は
  現行のモデルIDではないため、Anthropic 側の既定は `claude-sonnet-5` にした。
- **利き手設定**: 「扇を左右反転」を、**要の位置だけを左右に寄せる**実装にした。
  段階の並び（左端 -2 → 右端 +2）は反転させていない。§S-2 の
  「右肩上がりで肯定」を保つためと、利き手によって記録の意味が変わらないようにするため。
  並びごと反転させたい場合は `src/components/Fan.tsx` の `values` を左利き時に
  反転すればよい。
- **設定値の保存先**: 記録本体は仕様どおり IndexedDB。設定値のみ、起動レイテンシ
  要件（1秒以内）のため同期読み出しできる `localStorage` に置いた。
