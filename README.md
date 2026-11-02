# Shifting Corkboard Viewer

画像のスライドショーや動画を、コルクボード上で動的に動かすWEBアプリケーション。
ブラウザのIndexedDBを使ってそれぞれの環境だけでデータを持つため、インターネット上にデータは保存しない。

| 画面 | URL | 役割 |
| --- | --- | --- |
| 作画面 | `/shifting-corkboard-viewer/` | 画像の追加、枠の増減、切り替え操作 |
| コルクボード | `/shifting-corkboard-viewer/board.html` | 表示専用。管理画面と連動 |

## 画面イメージ

### 操作画面

<img width="1359" height="601" alt="image" src="https://github.com/user-attachments/assets/d99c9686-6724-49e0-ba6a-559f6cf808f2" />

### コルクボード画面

<img width="1149" height="828" alt="image" src="https://github.com/user-attachments/assets/4f393455-5474-403d-95bd-6a8e7b68d0e8" />


## ローカル起動

```bash
npm install
npm run dev
```

- 管理画面：`http://localhost:5173/`
- コルクボード：`http://localhost:5173/board.html`

## ファイル構成

```
index.html            操作画面
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
