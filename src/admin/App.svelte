<script>
  import { onMount, untrack } from 'svelte';
  import Slot from './Slot.svelte';
  import SlotEditor from './SlotEditor.svelte';
  import { viewer, MAX_SLOTS, INTERVALS } from '../lib/viewer.svelte.js';

  let width = $state(1200);
  let editingId = $state(null); // 中身を編集中の枠ID
  let newInput = $state();
  let newDrag = $state(false);
  let importInput = $state();
  let busy = $state(''); // 書き出し・読み込み中の表示
  let ioError = $state('');

  const boardUrl = `${import.meta.env.BASE_URL}board.html`;

  // 末尾の新しい枠の受け口。上限到達時・空の枠があるときは出さない
  const showAdd = $derived(
    viewer.slots.length < MAX_SLOTS && viewer.slots.every((s) => s.imgs.length),
  );

  // 1行の枠数（画面幅で決定）。枠の数によらず固定し、枠を足しても大きさを変えない
  const perRow = $derived(width <= 540 ? 2 : width <= 980 ? 4 : 7);

  // 枠の形・表示方法 → CSS変数
  $effect(() => {
    const r = document.documentElement.style;
    r.setProperty('--ratio', viewer.ratio);
    r.setProperty('--fit', viewer.fit);
  });

  // 再生を始めたら動画を頭から（動画の長さで枠を進めるタイミングと合わせる）
  $effect(() => {
    if (viewer.playing) untrack(() => document.querySelectorAll('.stage video').forEach((v) => { v.currentTime = 0; }));
  });

  function openBoard() {
    window.open(boardUrl, 'shifting-corkboard');
  }

  function clearAll() { viewer.clearAll(); }

  // 枠と画像・動画を zip でダウンロード
  async function exportData() {
    busy = '書き出し中…';
    ioError = '';
    try {
      const blob = await viewer.exportZip();
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shifting-corkboard-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { ioError = '書き出しに失敗しました'; }
    busy = '';
  }

  // 書き出した zip を読み込み、今の内容と置き換える
  async function importData(file) {
    if (!file) return;
    if (viewer.slots.length && !confirm('今の枠と画像はすべて置き換わります。読み込みますか？')) return;
    busy = '読み込み中…';
    ioError = '';
    try { await viewer.importZip(file); }
    catch (e) { ioError = e.message || '読み込みに失敗しました'; }
    busy = '';
  }

  function onKey(e) {
    if (e.target.closest('input,select,textarea,dialog')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); viewer.step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewer.step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); viewer.rewind(); }
    else if (e.key === ' ') { e.preventDefault(); viewer.setPlay(!viewer.playing); }
    else if (e.key === 'r' || e.key === 'R') viewer.setShuffle(!viewer.shuffle);
  }

  // 新しい枠への画像ドロップ
  function onNewOver(e) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    newDrag = true;
  }
  function onNewDrop(e) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    newDrag = false;
    viewer.addNew(e.dataTransfer.files);
  }

  onMount(() => viewer.init({ seed: true }));
</script>

<svelte:window
  bind:innerWidth={width}
  onkeydown={onKey}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => e.preventDefault()}
/>

<div class="wrap">
  <header>
    <h1>Shifting Corkboard <small>操作画面</small></h1>
    <a class="boardlink" href={boardUrl} target="shifting-corkboard"
      onclick={(e) => { e.preventDefault(); openBoard(); }}>コルクボードを開く ↗</a>
  </header>

  <div class="bar" role="toolbar" aria-label="操作">
    <div class="group">
      <button onclick={() => viewer.rewind()} title="全部の枠を1枚目に戻す（Home）">⏮ 最初へ</button>
      <button class="nav" onclick={() => viewer.step(-1)}>◀ 前へ</button>
      <button class="nav primary" onclick={() => viewer.step(1)}>次へ ▶</button>
    </div>
    <div class="sep"></div>
    <div class="group">
      <button aria-pressed={viewer.playing} onclick={() => viewer.setPlay(!viewer.playing)}>{viewer.playing ? '再生中' : '再生'}</button>
      <button aria-pressed={viewer.shuffle} onclick={() => viewer.setShuffle(!viewer.shuffle)}>シャッフル</button>
      <label class="sel">間隔
        <select value={viewer.interval} onchange={(e) => viewer.setSpeed(+e.currentTarget.value)}>
          {#each INTERVALS as ms}<option value={ms}>{ms / 1000}秒</option>{/each}
        </select>
      </label>
    </div>
    <div class="sep"></div>
    <div class="group">
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
      <button onclick={exportData} disabled={!!busy || !viewer.total} title="枠と画像・動画を zip で保存">ダウンロード</button>
      <button onclick={() => importInput.click()} disabled={!!busy} title="ダウンロードした zip を読み込む">インポート</button>
      <input bind:this={importInput} type="file" accept=".zip,application/zip" hidden
        onchange={(e) => { importData(e.currentTarget.files[0]); e.currentTarget.value = ''; }} />
      <button class="danger" onclick={clearAll}>すべて消去</button>
    </div>
  </div>

  <p class="note">
    <span>
      {#if !viewer.ready}読み込み中…
      {:else if busy}{busy}
      {:else if ioError}<span class="warn">{ioError}</span>
      {:else if !viewer.storageOk}<span class="warn">このブラウザでは画像を保存できません。再読み込みすると消え、コルクボードにも表示されません（プライベートブラウズを解除すると使えます）</span>
      {:else if viewer.total}{viewer.total}枚を読み込み済み
      {:else}まだ画像がありません{/if}
    </span>
    <span><kbd>←</kbd><kbd>→</kbd> 切り替え　<kbd>Home</kbd> 最初へ　<kbd>Space</kbd> 再生　<kbd>R</kbd> シャッフル</span>
  </p>

  <div class="stage" role="list" style:--cols={perRow}>
    {#each viewer.slots as slot, i (slot.id)}
      <Slot {slot} index={i} onedit={() => (editingId = slot.id)} />
    {/each}
    {#if showAdd}
      <!-- 見出しの高さぶん空けて、枠と上端をそろえる -->
      <div class="addcol">
        <span class="addcol-head" aria-hidden="true">&nbsp;</span>
        <button class="addtile" class:drag={newDrag} onclick={() => newInput.click()}
          ondragover={onNewOver} ondragleave={() => (newDrag = false)} ondrop={onNewDrop}>
          <span class="addtile-plus" aria-hidden="true">＋</span>
          クリックまたはドロップで画像・動画を追加
        </button>
        <input bind:this={newInput} type="file" accept="image/*,video/*" multiple hidden
          onchange={(e) => { viewer.addNew(e.currentTarget.files); e.currentTarget.value = ''; }} />
      </div>
    {/if}
  </div>
</div>

<SlotEditor slotId={editingId} onclose={() => (editingId = null)} />

<style>
  /* ---------- レイアウト・見出し ---------- */

  /* スクロールバーの幅を常に空けておく。縦に長くなってバーが出ても枠が縮まない */
  :global(html) {
    scrollbar-gutter: stable;
  }

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

  /* 末尾の新しい枠の受け口。Slot の空の枠と同じ見た目 */
  .addcol {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .addcol-head {
    min-height: 24px; /* Slot の見出しと同じ高さ */
    font-size: 12px;
  }

  .addtile {
    aspect-ratio: var(--ratio);
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: 2px dashed var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.6;
    text-align: center;
  }

  .addtile-plus {
    font-size: 26px;
    line-height: 1;
  }

  .addtile:hover,
  .addtile.drag {
    border-color: var(--accent);
    color: var(--accent);
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
</style>
