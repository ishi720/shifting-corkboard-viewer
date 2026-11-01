# Shifting Corkboard Viewer

複数の枠の画像・動画を、枠ごとに切り替えて表示するコルクビュー。

| 画面 | URL | 役割 |
| --- | --- | --- |
| 管理画面 | `/shifting-corkboard-viewer/` | 画像の追加、枠の増減、切り替え操作 |
| コルクボード | `/shifting-corkboard-viewer/board.html` | 表示専用。管理画面と連動 |


## ローカル起動

```bash
npm install
npm run dev
```

- 管理画面：`http://localhost:5173/`
- コルクボード：`http://localhost:5173/board.html`

## ファイル構成

```
index.html            管理画面
board.html            コルクボード
src/
  lib/                共通
    viewer.svelte.js  状態とロジック（枠、切り替え、保存、画面間の連動）
    db.js             IndexedDB の読み書き
  admin/
    App.svelte        操作バーと枠の一覧
    Slot.svelte       枠1つ分
  board/
    Board.svelte      コルクボード
  app.css             共通スタイル
.github/workflows/deploy.yml  GitHub Pages への自動公開
```
