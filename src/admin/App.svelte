<script>
  import { onMount } from 'svelte';
  import Slot from './Slot.svelte';
  import { viewer, MAX_SLOTS, INTERVALS } from '../lib/viewer.svelte.js';

  let width = $state(1200);
  let stage;
  let fsError = $state(false);

  const boardUrl = `${import.meta.env.BASE_URL}board.html`;

  // 1行の最大枠数（画面幅で決定）
  const perRow = $derived(width <= 540 ? 2 : width <= 980 ? 4 : 7);
  const cols = $derived(Math.max(1, Math.min(viewer.slots.length, perRow)));
  const rows = $derived(Math.ceil(viewer.slots.length / cols));

  // 枠の形・表示方法 → CSS変数
  $effect(() => {
    const r = document.documentElement.style;
    r.setProperty('--ratio', viewer.ratio);
    r.setProperty('--fit', viewer.fit);
  });

  function openBoard() {
    window.open(boardUrl, 'shifting-corkboard');
  }

  async function toggleFs() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch { fsError = true; }
  }

  function clearAll() { viewer.clearAll(); }

  function onKey(e) {
    if (e.target.closest('input,select,textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); viewer.step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewer.step(-1); }
    else if (e.key === ' ') { e.preventDefault(); viewer.setPlay(!viewer.playing); }
    else if (e.key === 'r' || e.key === 'R') viewer.setShuffle(!viewer.shuffle);
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === '+') viewer.addSlot();
  }

  // 枠外へのドロップは全枠に配る
  function onWindowDrop(e) { e.preventDefault(); viewer.bulk(e.dataTransfer.files); }

  onMount(() => viewer.init({ seed: true }));
</script>

<svelte:window
  bind:innerWidth={width}
  onkeydown={onKey}
  ondragover={(e) => e.preventDefault()}
  ondrop={onWindowDrop}
/>

<div class="wrap">
  <header>
    <h1>Shifting Corkboard <small>管理画面</small></h1>
    <a class="boardlink" href={boardUrl} target="shifting-corkboard"
      onclick={(e) => { e.preventDefault(); openBoard(); }}>コルクボードを開く ↗</a>
  </header>

  <div class="bar" role="toolbar" aria-label="操作">
    <div class="group">
      <button class="nav" onclick={() => viewer.step(-1)}>◀ 前へ</button>
      <div class="counter" aria-live="polite"><small>セット</small>{viewer.shuffle ? 'ランダム' : `${viewer.set + 1} / ${viewer.maxLen}`}</div>
      <button class="nav primary" onclick={() => viewer.step(1)}>次へ ▶</button>
    </div>
    <div class="sep"></div>
    <div class="group">
      <button class="addslot" onclick={() => viewer.addSlot()} disabled={viewer.slots.length >= MAX_SLOTS}>＋ 枠を追加</button>
      <span class="slotcount">枠 <b>{viewer.slots.length}</b></span>
    </div>
    <div class="sep"></div>
    <div class="group">
      <button aria-pressed={viewer.playing} onclick={() => viewer.setPlay(!viewer.playing)}>{viewer.playing ? 'ループ中' : 'ループ再生'}</button>
      <button aria-pressed={viewer.shuffle} onclick={() => viewer.setShuffle(!viewer.shuffle)}>ランダム</button>
      <label class="sel">間隔
        <select value={viewer.interval} onchange={(e) => viewer.setSpeed(+e.currentTarget.value)}>
          {#each INTERVALS as ms}<option value={ms}>{ms / 1000}秒</option>{/each}
        </select>
      </label>
    </div>
    <div class="sep"></div>
    <div class="group">
      <span class="filebtn">画像をまとめて追加<input type="file" accept="image/*" multiple aria-label="画像をまとめて追加"
          onchange={(e) => { viewer.bulk(e.currentTarget.files); e.currentTarget.value = ''; }} /></span>
      <label class="sel">枠の形
        <select value={viewer.ratio} onchange={(e) => viewer.setRatio(e.currentTarget.value)}>
          <option value="5/8">縦長カード 5:8</option><option value="3/4">縦 3:4</option>
          <option value="1/1">正方形</option><option value="4/3">横 4:3</option><option value="16/9">横 16:9</option>
        </select>
      </label>
      <label class="sel">表示
        <select value={viewer.fit} onchange={(e) => viewer.setFit(e.currentTarget.value)}><option value="cover">枠いっぱい</option><option value="contain">全体を表示</option></select>
      </label>
    </div>
    <div class="sep"></div>
    <div class="group">
      <button onclick={toggleFs}>全画面</button>
      <button class="danger" onclick={clearAll}>すべて消去</button>
    </div>
  </div>

  <p class="note">
    <span>
      {#if !viewer.ready}読み込み中…
      {:else if !viewer.storageOk}<span class="warn">このブラウザでは画像を保存できません。再読み込みすると消え、コルクボードにも表示されません（プライベートブラウズを解除すると使えます）</span>
      {:else if fsError}この画面では全画面表示を使えません
      {:else if viewer.total}{viewer.total}枚を読み込み済み
      {:else}まだ画像がありません{/if}
    </span>
    <span><kbd>←</kbd><kbd>→</kbd> 切り替え　<kbd>Space</kbd> ループ　<kbd>R</kbd> ランダム　<kbd>F</kbd> 全画面　<kbd>+</kbd> 枠を追加</span>
  </p>

  <div class="stage" role="list" bind:this={stage} style:--cols={cols} style:--rows={rows}>
    {#each viewer.slots as slot, i (slot.id)}
      <Slot {slot} index={i} />
    {/each}
  </div>
</div>

<style>
  /* ---------- レイアウト・見出し ---------- */

  .wrap {
    max-width: 1480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 16px;
  }

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    letter-spacing: .02em;
  }

  h1 small {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    margin-left: 6px;
  }

  /* ---------- 操作バー ---------- */

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--line);
  }

  .nav {
    min-width: 84px;
  }

  .counter {
    font-family: var(--f-num);
    font-variant-numeric: tabular-nums;
    font-size: 15px;
    min-width: 92px;
    text-align: center;
  }

  .counter small {
    display: block;
    font-family: var(--f-ui);
    font-size: 11px;
    color: var(--muted);
    letter-spacing: .06em;
  }

  .addslot {
    font-weight: 700;
    border-style: dashed;
    border-color: var(--accent);
    color: var(--accent);
  }

  .slotcount {
    color: var(--muted);
    font-size: 12px;
    min-width: 44px;
  }

  .slotcount b {
    font-family: var(--f-num);
    color: var(--ink);
    font-size: 14px;
  }

  .sel {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  @media (max-width: 540px) {
    .sep {
      display: none;
    }
  }

  /* ---------- 注記・リンク ---------- */

  .note {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }

  .note kbd {
    font-family: var(--f-num);
    font-size: 11px;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0 5px;
    background: var(--surface);
  }

  .warn {
    color: var(--danger);
  }

  .boardlink {
    margin-left: auto;
    color: var(--accent);
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
    border: 1px solid var(--accent);
    border-radius: 7px;
    padding: 6px 11px;
    white-space: nowrap;
  }

  .boardlink:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* ---------- ステージ ---------- */

  /* 枠幅の上限は画面の高さに収まる大きさ。中央寄せ */
  .stage {
    --colmax: max(140px, calc((100svh - 300px) * var(--ratio)));

    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, var(--colmax)));
    gap: 12px;
    justify-content: center;
    background: var(--bg);
  }

  .stage:fullscreen {
    --colmax: calc((96vh - (var(--rows) - 1) * 12px) / var(--rows) * var(--ratio));

    padding: 2vh 2vw;
    align-content: center;
    background: #000;
  }
</style>
