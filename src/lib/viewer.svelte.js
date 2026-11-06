// 状態とロジック。操作画面・コルクボード共通
//   - 画像・動画は IndexedDB に保存し、表示用URLは各画面で作る
//   - 状態の変更は保存して BroadcastChannel で他タブへ通知
//   - 受信側は状態を置き換え、未読の画像を読み込む

import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as db from './db.js';

export const MAX_SLOTS = 24;
/** 枠の名前の最大文字数 */
export const NAME_MAX = 30;
const CHANNEL = 'shifting-corkboard-viewer';

const mod = (a, n) => ((a % n) + n) % n;
const uid = () => crypto.randomUUID();
const newSlot = () => ({ id: uid(), imgs: [], offset: 0, order: [], pos: 0 });

/** 0..n-1 をシャッフル。first を先頭に置く */
function shuffled(n, first) {
  if (!n) return [];
  const a = [...Array(n).keys()].filter((k) => k !== first);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [first, ...a];
}

/** 画像・動画ファイルのみ、ファイル名の自然順 */
const images = (list) =>
  [...list]
    .filter((f) => /^(image|video)\//.test(f.type))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));

class Viewer {
  /** 枠: { id, imgs: 画像ID[], offset, order, pos, name? }
   *  name は操作画面での表示名（なければ「枠 n」）
   *  offset は表示中の画像番号（枚数で割った余りを使う）
   *  order/pos はシャッフル時の枠ごとの並びと位置 */
  slots = $state([]);
  shuffle = $state(false);
  ratio = $state('5/8');
  fit = $state('cover');

  /** 再生 */
  playing = $state(false);
  interval = $state(3000);
  /** タイマー担当のコルクボードID（二重進行の防止）。null なら開いているボードが引き受ける */
  playOwner = $state(null);

  ready = $state(false);
  storageOk = $state(true);

  /** 画像ID → 表示用URL */
  urls = new SvelteMap();
  /** 動画の画像ID */
  videos = new SvelteSet();
  /** 動画の画像ID → 長さ(秒)。再生中はこの長さで枠を進める */
  durations = new SvelteMap();

  total = $derived(this.slots.reduce((a, s) => a + s.imgs.length, 0));

  #channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  #saving = Promise.resolve();
  #applySeq = 0;
  #id = uid();
  /** コルクボードか。再生のタイマーはボードだけが動かす */
  #player = false;
  /** 操作画面の再生中の表示。枠ID → 画像ID（再生でボードが進めても変えない） */
  #shown = new SvelteMap();
  /** 再生中、枠ごとの次に進める時刻。枠ID → { id: 表示中の画像ID, at, interval } */
  #due = new Map();

  constructor() {
    $effect.root(() => {
      // 担当のいない再生はボードが引き受ける（後から開いたボード・担当が閉じたあと）
      $effect(() => {
        // #player は $state ではないので最後に見る（先に見ると再生の変化を追えない）
        if (this.playing && !this.playOwner && this.#player) {
          untrack(() => { this.playOwner = this.#id; this.commit(); });
        }
      });

      // 再生のタイマー（担当のボードのみ）
      // 枠ごとに、画像は間隔、動画はその長さだけ表示してから進める
      $effect(() => {
        if (!this.playing || this.playOwner !== this.#id) { this.#due.clear(); return; }
        const now = performance.now();
        const interval = this.interval;
        const live = new Set();
        for (const s of this.slots) {
          if (!s.imgs.length) continue;
          live.add(s.id);
          const id = s.imgs[this.cur(s)];
          // 動画を停止中の枠は進めない
          if (s.hold === id) { this.#due.delete(s.id); continue; }
          const d = this.#due.get(s.id);
          if (d?.id === id && d.interval === interval) continue;
          const sec = this.durations.get(id);
          const ms = s.left?.id === id ? s.left.ms : sec ? sec * 1000 : interval;
          this.#due.set(s.id, { id, interval, at: now + ms });
        }
        for (const sid of this.#due.keys()) if (!live.has(sid)) this.#due.delete(sid);

        const next = Math.min(...[...this.#due.values()].map((d) => d.at));
        if (!Number.isFinite(next)) return;
        const t = setTimeout(() => this.#tick(), Math.max(0, next - now));
        return () => clearTimeout(t);
      });
    });

    // 担当のボードが閉じたら担当を空ける（再生は続け、ほかのボードが引き受ける）
    window.addEventListener('pagehide', () => {
      if (!this.playing || this.playOwner !== this.#id) return;
      this.playOwner = null;
      const state = this.#snapshot();
      this.#channel?.postMessage({ type: 'state', state });
      db.putState(state).catch(() => {});
    });
  }

  // ---------------------------------------------------------------
  // 起動・保存・同期
  // ---------------------------------------------------------------

  /** seed: 操作画面から呼ぶとき true。未使用の画像を掃除する
   *  player: コルクボードから呼ぶとき true。開いたら再生を始め、タイマーを担当する */
  async init({ seed = false, player = false } = {}) {
    this.#player = player;
    this.#channel?.addEventListener('message', (e) => {
      if (e.data?.type === 'state') this.#apply(e.data.state);
    });

    let saved = null;
    try { saved = await db.getState(); } catch { this.storageOk = false; }

    if (saved) {
      await this.#apply(saved);
      if (seed) this.#cleanup();
    }
    this.#snap();
    this.ready = true;
    if (player) this.setPlay(true);
  }

  #snapshot() {
    return $state.snapshot({
      slots: this.slots, shuffle: this.shuffle, ratio: this.ratio, fit: this.fit,
      playing: this.playing, interval: this.interval, playOwner: this.playOwner,
    });
  }

  /** 保存して他画面へ通知 */
  commit() {
    this.#snap(); // この画面での操作は操作画面の表示にも反映する
    const state = this.#snapshot();
    // 保存は直列で行う
    this.#saving = this.#saving
      .then(() => db.putState(state))
      .catch(() => { this.storageOk = false; })
      .then(() => this.#channel?.postMessage({ type: 'state', state }));
  }

  /** 受信・保存済みの状態を反映 */
  async #apply(state) {
    const seq = ++this.#applySeq;
    const ids = new Set(state.slots.flatMap((s) => s.imgs));
    await this.#load(ids);
    if (seq !== this.#applySeq) return; // 新しい状態が来ていれば破棄

    // 旧形式（全体の位置 g + 枠ごとの差 offset）は、表示を保って枠ごとの位置へ
    const g = state.g ?? 0;
    this.slots = g ? state.slots.map((s) => ({ ...s, offset: s.offset + g })) : state.slots;
    this.shuffle = !!state.shuffle;
    this.ratio = state.ratio ?? '5/8';
    this.fit = state.fit ?? 'cover';
    this.playing = !!state.playing;
    this.interval = state.interval ?? 3000;
    this.playOwner = state.playOwner ?? null;
    // 再生中にボードが進めた分は、操作画面の表示に反映しない
    if (!this.playing) this.#snap();

    for (const [id, url] of this.urls) {
      if (!ids.has(id)) { URL.revokeObjectURL(url); this.#untrack(id); }
    }
  }

  /** 未読の画像を読み込む */
  async #load(ids) {
    for (const id of ids) {
      if (this.urls.has(id)) continue;
      try {
        const blob = await db.getImage(id);
        if (blob) this.#track(id, blob);
      } catch { this.storageOk = false; }
    }
  }

  /** 未使用の画像を削除 */
  async #cleanup() {
    try {
      const used = new Set(this.slots.flatMap((s) => s.imgs));
      const orphans = (await db.imageKeys()).filter((k) => !used.has(k));
      if (orphans.length) await db.deleteImages(orphans);
    } catch { /* 失敗しても無害 */ }
  }

  /** Blob を保存し、画像IDを返す */
  async #store(blobs) {
    const entries = blobs.map((b) => [uid(), b]);
    try { await db.putImages(entries); } catch { this.storageOk = false; }
    for (const [id, b] of entries) this.#track(id, b);
    return entries.map(([id]) => id);
  }

  /** 画像を表示用URLごと削除 */
  #forget(ids) {
    if (!ids.length) return;
    for (const id of ids) {
      const u = this.urls.get(id);
      if (u) URL.revokeObjectURL(u);
      this.#untrack(id);
    }
    db.deleteImages(ids).catch(() => {});
  }

  /** 表示用URLを作る。動画なら長さも調べる */
  #track(id, blob) {
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    if (!blob.type.startsWith('video/')) return;
    this.videos.add(id);

    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = () => {
      if (Number.isFinite(v.duration) && v.duration > 0 && this.urls.has(id)) this.durations.set(id, v.duration);
      v.onloadedmetadata = v.ondurationchange = null;
      v.removeAttribute('src');
      v.load();
    };
    // 録画した webm などは長さが Infinity になるので、末尾へシークして確定させる
    v.onloadedmetadata = () => { if (v.duration === Infinity) v.currentTime = 1e101; else done(); };
    v.ondurationchange = () => { if (Number.isFinite(v.duration)) done(); };
    v.onerror = done;
    v.src = url;
  }

  #untrack(id) {
    this.urls.delete(id);
    this.videos.delete(id);
    this.durations.delete(id);
  }

  #find(slot) { return this.slots.find((s) => s.id === slot.id); }

  // ---------------------------------------------------------------
  // 表示
  // ---------------------------------------------------------------

  url(id) { return this.urls.get(id); }
  isVideo(id) { return this.videos.has(id); }

  /** 枠 s の表示中の画像番号 */
  cur(s) {
    const len = s.imgs.length;
    if (!len) return 0;
    if (this.shuffle && s.order?.length === len) return s.order[mod(s.pos, len)];
    return mod(s.offset, len);
  }

  /** 枠 s の画面に出す画像番号。操作画面では再生中も止めておいた画像を出す */
  shown(s) {
    if (!this.#player && this.playing) {
      const i = s.imgs.indexOf(this.#shown.get(s.id));
      if (i >= 0) return i;
    }
    return this.cur(s);
  }

  /** 操作画面の表示を今の位置に合わせる */
  #snap() {
    if (this.#player) return;
    untrack(() => {
      this.#shown.clear();
      for (const s of this.slots) if (s.imgs.length) this.#shown.set(s.id, s.imgs[this.cur(s)]);
    });
  }

  // ---------------------------------------------------------------
  // 操作（最後に commit）
  // ---------------------------------------------------------------

  /** 全枠をそれぞれ d 進める */
  step(d) {
    for (const s of this.slots) this.#move(s, d);
    this.commit();
  }

  /** 再生タイマー。時刻が来た枠を進める */
  #tick() {
    const soon = performance.now() + 30;
    const due = this.slots.filter((s) => (this.#due.get(s.id)?.at ?? Infinity) <= soon);
    for (const s of due) {
      this.#due.delete(s.id);
      this.#move(s, 1);
    }
    this.commit();
  }

  /** 枠 s を d 進める */
  #move(s, d) {
    s.hold = null;
    s.left = null;
    if (this.shuffle) this.#advance(s, d);
    else s.offset += d;
  }

  /** シャッフル時、枠 s を自分の並びで d 進める。一巡したら並べ直す */
  #advance(s, d) {
    const len = s.imgs.length;
    if (len <= 1) return;
    if (s.order?.length !== len) this.#reshuffle(s, this.cur(s));
    const i = s.pos + d;
    if (i >= len) { this.#reshuffle(s, s.order[s.pos]); s.pos = 1; }
    else s.pos = mod(i, len);
  }

  /** 枠 s の並びを作り直す。first を今の表示にする */
  #reshuffle(s, first) {
    s.order = shuffled(s.imgs.length, first);
    s.pos = 0;
  }

  /** 全枠を1枚目に戻す */
  rewind() {
    for (const s of this.slots) {
      s.offset = 0;
      if (this.shuffle) this.#reshuffle(s, 0);
    }
    this.commit();
  }

  setShuffle(on) {
    // 切り替えても各枠の表示中の画像は変えない
    const shown = this.slots.map((s) => this.cur(s));
    this.shuffle = !!on;
    this.slots.forEach((s, k) => {
      if (on) this.#reshuffle(s, shown[k]);
      else s.offset = shown[k];
    });
    this.commit();
  }

  /** 再生開始・停止。ボードで操作したらそのボードが担当、操作画面からなら開いているボードが引き受ける */
  setPlay(on) {
    this.playing = !!on;
    this.playOwner = on && this.#player ? this.#id : null;
    this.commit();
  }
  setSpeed(ms) { this.interval = ms; this.commit(); }

  /** 枠の表示中の動画を停止・再開する。停止中は再生しても枠を進めない
   *  t: 再開時の動画の再生位置(秒)。残りの長さだけ表示してから進める */
  holdVideo(slot, on, t = 0) {
    const s = this.#find(slot);
    if (!s?.imgs.length) return;
    const id = s.imgs[this.cur(s)];
    const sec = this.durations.get(id);
    s.hold = on ? id : null;
    s.left = !on && this.playing && sec ? { id, ms: Math.max(0, sec - t) * 1000 } : null;
    this.commit();
  }

  setRatio(v) { this.ratio = v; this.commit(); }
  setFit(v) { this.fit = v; this.commit(); }

  /** 枠の表示名。名前がなければ「枠 n」 */
  label(slot) {
    return slot.name || `枠 ${this.slots.findIndex((s) => s.id === slot.id) + 1}`;
  }

  /** 枠の名前を変える。空なら名前なし（「枠 n」に戻る） */
  renameSlot(slot, name) {
    const s = this.#find(slot);
    if (!s) return;
    const v = String(name ?? '').trim().slice(0, NAME_MAX);
    if ((s.name ?? '') === v) return;
    if (v) s.name = v;
    else delete s.name;
    this.commit();
  }

  removeSlot(slot) {
    const s = this.#find(slot);
    if (!s) return;
    this.#forget(s.imgs);
    this.slots = this.slots.filter((x) => x.id !== s.id);
    this.commit();
  }

  /** 枠 id を to 番目へ移動 */
  moveSlot(id, to) {
    const from = this.slots.findIndex((s) => s.id === id);
    if (from < 0 || from === to) return;
    const [s] = this.slots.splice(from, 1);
    this.slots.splice(to, 0, s);
    this.commit();
  }

  stepSlot(slot, d) {
    const s = this.#find(slot);
    if (!s?.imgs.length) return;
    this.#move(s, d);
    this.commit();
  }

  /** 枠 s の表示を i 枚目にする */
  #show(s, i) {
    if (this.shuffle) this.#reshuffle(s, i);
    else s.offset = i;
  }

  showImage(slot, i) {
    const s = this.#find(slot);
    if (!s) return;
    this.#show(s, i);
    this.commit();
  }

  /** 枠内の画像を from 番目から to 番目へ。表示中の画像は変えない */
  moveImage(slot, from, to) {
    const s = this.#find(slot);
    if (!s || from === to) return;
    const shown = s.imgs[this.cur(s)];
    const [id] = s.imgs.splice(from, 1);
    s.imgs.splice(to, 0, id);
    this.#show(s, s.imgs.indexOf(shown));
    this.commit();
  }

  /** 枠内の i 番目の画像を削除。表示中なら同じ位置の次の画像を出す */
  removeImage(slot, i) {
    const s = this.#find(slot);
    if (!s) return;
    const k = this.cur(s);
    const shown = s.imgs[k];
    const [id] = s.imgs.splice(i, 1);
    this.#forget([id]);
    if (!s.imgs.length) { s.offset = 0; s.order = []; s.pos = 0; }
    else this.#show(s, id === shown ? Math.min(k, s.imgs.length - 1) : s.imgs.indexOf(shown));
    this.commit();
  }

  /** 枠 s に画像を足す。シャッフル時は表示中の画像を保って並べ直す */
  #push(s, ids) {
    if (!ids.length) return;
    const shown = this.cur(s);
    s.imgs.push(...ids);
    if (this.shuffle) this.#reshuffle(s, shown);
  }

  /** 枠に画像を追加 */
  async addTo(slot, list) {
    const fs = images(list);
    if (!fs.length) return;
    const ids = await this.#store(fs);
    const s = this.#find(slot);
    if (!s) { this.#forget(ids); return; }
    this.#push(s, ids);
    this.commit();
  }

  /** 新しい枠を末尾に作り、画像を入れる */
  async addNew(list) {
    const fs = images(list);
    if (!fs.length || this.slots.length >= MAX_SLOTS) return;
    const ids = await this.#store(fs);
    if (this.slots.length >= MAX_SLOTS) { this.#forget(ids); return; }
    const s = newSlot();
    s.imgs = ids;
    if (this.shuffle) this.#reshuffle(s, 0);
    this.slots.push(s);
    this.commit();
  }

  /** 画像も枠もすべて消す */
  clearAll() {
    for (const s of this.slots) this.#forget(s.imgs);
    this.slots = [];
    this.playing = false;
    this.playOwner = null;
    this.commit();
  }

  // ---------------------------------------------------------------
  // 書き出し・読み込み
  //   zip の中身: manifest.json（状態と画像の一覧）+ images/ の画像・動画
  // ---------------------------------------------------------------

  /** 枠と画像・動画を zip にまとめて返す */
  async exportZip() {
    const files = {};
    const images = {};
    for (const id of new Set(this.slots.flatMap((s) => s.imgs))) {
      const url = this.urls.get(id);
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      const ext = (blob.type.split('/')[1] ?? 'bin').split(/[+;]/)[0];
      const file = `images/${id}.${ext}`;
      files[file] = new Uint8Array(await blob.arrayBuffer());
      images[id] = { file, type: blob.type };
    }
    const manifest = {
      app: CHANNEL, version: 1, images,
      state: $state.snapshot({
        slots: this.slots.map((s) => ({ ...s, imgs: s.imgs.filter((id) => images[id]) })),
        shuffle: this.shuffle, ratio: this.ratio, fit: this.fit, interval: this.interval,
      }),
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    // 画像・動画はもともと圧縮済みなので、そのまま格納する
    return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
  }

  /** exportZip の zip を読み込み、今の枠と画像をすべて置き換える。失敗時は例外 */
  async importZip(file) {
    let files, manifest;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      manifest = JSON.parse(strFromU8(files['manifest.json']));
    } catch { throw new Error('ファイルを読み込めませんでした'); }
    if (manifest?.app !== CHANNEL || !Array.isArray(manifest.state?.slots)) {
      throw new Error('このアプリで書き出したファイルではありません');
    }

    // 画像IDは振り直す
    const ids = new Map();
    const blobs = [];
    for (const [old, info] of Object.entries(manifest.images ?? {})) {
      const data = files[info?.file];
      if (!data) continue;
      ids.set(old, blobs.length);
      blobs.push(new Blob([data], { type: info.type ?? '' }));
    }

    for (const s of this.slots) this.#forget(s.imgs);
    const newIds = await this.#store(blobs);

    const { state } = manifest;
    this.slots = state.slots.slice(0, MAX_SLOTS).map((s) => {
      const imgs = (s.imgs ?? []).filter((id) => ids.has(id)).map((id) => newIds[ids.get(id)]);
      const order = s.order?.length === imgs.length ? s.order : [];
      const slot = { id: s.id ?? uid(), imgs, offset: s.offset ?? 0, order, pos: s.pos ?? 0 };
      const name = typeof s.name === 'string' ? s.name.trim().slice(0, NAME_MAX) : '';
      if (name) slot.name = name;
      return slot;
    });
    this.shuffle = !!state.shuffle;
    this.ratio = state.ratio ?? '5/8';
    this.fit = state.fit ?? 'cover';
    this.interval = state.interval ?? 3000;
    this.playing = false;
    this.playOwner = null;
    this.commit();
  }
}

/** 再生間隔(ms) */
export const INTERVALS = [1000, 2000, 3000, 5000, 10000, 15000, 30000];

export const viewer = new Viewer();
