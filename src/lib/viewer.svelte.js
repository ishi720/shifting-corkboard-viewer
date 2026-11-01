// 状態とロジック。管理画面・コルクボード共通
//   - 画像は IndexedDB に保存し、表示用URLは各画面で作る
//   - 状態の変更は保存して BroadcastChannel で他タブへ通知
//   - 受信側は状態を置き換え、未読の画像を読み込む

import { SvelteMap } from 'svelte/reactivity';
import * as db from './db.js';

export const MAX_SLOTS = 24;
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

/** 画像ファイルのみ、ファイル名の自然順 */
const images = (list) =>
  [...list]
    .filter((f) => f.type.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));

class Viewer {
  /** 枠: { id, imgs: 画像ID[], offset, order, pos }
   *  order/pos はシャッフル時の枠ごとの並びと位置 */
  slots = $state([]);
  g = $state(0);
  shuffle = $state(false);
  ratio = $state('5/8');
  fit = $state('cover');

  /** 再生 */
  playing = $state(false);
  interval = $state(3000);
  /** タイマー担当の画面ID（二重進行の防止） */
  playOwner = $state(null);

  ready = $state(false);
  storageOk = $state(true);

  /** 画像ID → 表示用URL */
  urls = new SvelteMap();

  maxLen = $derived(Math.max(1, ...this.slots.map((s) => s.imgs.length)));
  set = $derived(mod(this.g, this.maxLen));
  total = $derived(this.slots.reduce((a, s) => a + s.imgs.length, 0));

  #channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  #saving = Promise.resolve();
  #applySeq = 0;
  #id = uid();
  #heardOwner = false;

  constructor() {
    // 再生のタイマー（担当画面のみ）
    $effect.root(() => {
      $effect(() => {
        if (!this.playing || this.playOwner !== this.#id) return;
        const t = setInterval(() => this.step(1), this.interval);
        return () => clearInterval(t);
      });
    });

    // 担当画面が閉じたら再生停止
    window.addEventListener('pagehide', () => {
      if (!this.playing || this.playOwner !== this.#id) return;
      this.playing = false;
      this.playOwner = null;
      const state = this.#snapshot();
      this.#channel?.postMessage({ type: 'state', state });
      db.putState(state).catch(() => {});
    });
  }

  // ---------------------------------------------------------------
  // 起動・保存・同期
  // ---------------------------------------------------------------

  /** seed: 管理画面から呼ぶとき true。未使用の画像を掃除する */
  async init({ seed = false } = {}) {
    this.#channel?.addEventListener('message', (e) => {
      const m = e.data;
      if (m?.type === 'state') {
        if (m.state.playing && m.state.playOwner === this.playOwner) this.#heardOwner = true;
        this.#apply(m.state);
      } else if (m?.type === 'who-plays' && this.playing && this.playOwner === this.#id) {
        this.commit(); // 担当の生存通知
      }
    });

    let saved = null;
    try { saved = await db.getState(); } catch { this.storageOk = false; }

    if (saved) {
      await this.#apply(saved);
      if (seed) this.#cleanup();
      // 担当画面が残っていなければ停止
      if (this.playing) {
        this.#heardOwner = false;
        this.#channel?.postMessage({ type: 'who-plays' });
        setTimeout(() => { if (this.playing && !this.#heardOwner) this.setPlay(false); }, 700);
      }
    }
    this.ready = true;
  }

  #snapshot() {
    return $state.snapshot({
      slots: this.slots, g: this.set, shuffle: this.shuffle, ratio: this.ratio, fit: this.fit,
      playing: this.playing, interval: this.interval, playOwner: this.playOwner,
    });
  }

  /** 保存して他画面へ通知 */
  commit() {
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

    this.slots = state.slots;
    this.g = state.g;
    this.shuffle = !!state.shuffle;
    this.ratio = state.ratio ?? '5/8';
    this.fit = state.fit ?? 'cover';
    this.playing = !!state.playing;
    this.interval = state.interval ?? 3000;
    this.playOwner = state.playOwner ?? null;

    for (const [id, url] of this.urls) {
      if (!ids.has(id)) { URL.revokeObjectURL(url); this.urls.delete(id); }
    }
  }

  /** 未読の画像を読み込む */
  async #load(ids) {
    for (const id of ids) {
      if (this.urls.has(id)) continue;
      try {
        const blob = await db.getImage(id);
        if (blob) this.urls.set(id, URL.createObjectURL(blob));
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
    for (const [id, b] of entries) this.urls.set(id, URL.createObjectURL(b));
    return entries.map(([id]) => id);
  }

  /** 画像を表示用URLごと削除 */
  #forget(ids) {
    if (!ids.length) return;
    for (const id of ids) {
      const u = this.urls.get(id);
      if (u) URL.revokeObjectURL(u);
      this.urls.delete(id);
    }
    db.deleteImages(ids).catch(() => {});
  }

  #find(slot) { return this.slots.find((s) => s.id === slot.id); }

  // ---------------------------------------------------------------
  // 表示
  // ---------------------------------------------------------------

  url(id) { return this.urls.get(id); }

  /** 枠 s の表示中の画像番号 */
  cur(s) {
    const len = s.imgs.length;
    if (!len) return 0;
    if (this.shuffle && s.order?.length === len) return s.order[mod(s.pos, len)];
    return mod(this.set + s.offset, len);
  }

  // ---------------------------------------------------------------
  // 操作（最後に commit）
  // ---------------------------------------------------------------

  step(d) {
    this.g = mod(this.set + d, this.maxLen);
    if (this.shuffle) for (const s of this.slots) this.#advance(s, d);
    this.commit();
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
    this.g = 0;
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
      else s.offset = shown[k] - this.set;
    });
    this.commit();
  }

  /** 再生開始・停止。操作した画面が担当 */
  setPlay(on) {
    this.playing = !!on;
    this.playOwner = on ? this.#id : null;
    this.commit();
  }
  setSpeed(ms) { this.interval = ms; this.commit(); }

  setRatio(v) { this.ratio = v; this.commit(); }
  setFit(v) { this.fit = v; this.commit(); }

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
    if (this.shuffle) this.#advance(s, d);
    else s.offset += d;
    this.commit();
  }

  emptySlot(slot) {
    const s = this.#find(slot);
    if (!s) return;
    this.#forget(s.imgs);
    s.imgs = []; s.offset = 0; s.order = []; s.pos = 0;
    this.commit();
  }

  /** 枠 s の表示を i 枚目にする */
  #show(s, i) {
    if (this.shuffle) this.#reshuffle(s, i);
    else s.offset = i - this.set;
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

  /** 全枠へ順に配る（1,2,3,1,2,3…）。枠が無ければ1つ作る */
  async bulk(list) {
    const fs = images(list);
    if (!fs.length) return;
    const ids = await this.#store(fs);
    if (!this.slots.length) this.slots.push(newSlot());
    const n = this.slots.length;
    this.slots.forEach((s, j) => this.#push(s, ids.filter((_, k) => k % n === j)));
    this.commit();
  }

  /** 画像も枠もすべて消す */
  clearAll() {
    for (const s of this.slots) this.#forget(s.imgs);
    this.slots = [];
    this.g = 0;
    this.playing = false;
    this.playOwner = null;
    this.commit();
  }
}

/** 再生間隔(ms) */
export const INTERVALS = [1000, 2000, 3000, 5000, 10000, 15000, 30000];

export const viewer = new Viewer();
