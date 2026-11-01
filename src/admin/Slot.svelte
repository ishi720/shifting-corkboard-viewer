<script>
  import { viewer } from '../lib/viewer.svelte.js';

  let { slot, index } = $props();

  let input;
  let dragging = $state(false);

  const len = $derived(slot.imgs.length);
  const k = $derived(viewer.cur(slot));
  const src = $derived(len ? viewer.url(slot.imgs[k]) : null);
  const n = $derived(index + 1);

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    viewer.addTo(slot, e.dataTransfer.files);
  }
  function onPick() {
    viewer.addTo(slot, input.files);
    input.value = '';
  }
</script>

<div class="slot">
  <div class="slot-head">
    <b>枠 {n}</b>
    <span class="n">{len ? `${k + 1} / ${len}` : '空'}</span>
  </div>

  <div
    class="frame"
    class:drag={dragging}
    role="group"
    aria-label="枠 {n}"
    ondragover={(e) => { e.preventDefault(); e.stopPropagation(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    {#if len}
      {#if src}
        {#key src}
          <img {src} alt="枠{n}の画像 {k + 1}枚目" class="in" />
        {/key}
      {/if}
      {#if slot.locked}<span class="lockbadge">固定中</span>{/if}
    {:else}
      <button class="empty" onclick={() => input.click()}>
        <strong>{n}</strong>クリックかドロップで<br />画像を追加
      </button>
    {/if}
  </div>

  <div class="slot-ctl">
    <button onclick={() => viewer.stepSlot(slot, -1)} disabled={!len} aria-label="枠{n}を前へ">◀</button>
    <button onclick={() => viewer.stepSlot(slot, 1)} disabled={!len} aria-label="枠{n}を次へ">▶</button>
    <span class="filebtn" title="この枠に画像を追加">＋<input
        bind:this={input} type="file" accept="image/*" multiple
        aria-label="枠{n}に画像を追加" onchange={onPick} /></span>
    <button onclick={() => viewer.toggleLock(slot)} aria-pressed={slot.locked}
      title="固定すると全体の切り替えで動きません">固定</button>
    <button onclick={() => viewer.emptySlot(slot)} disabled={!len} aria-label="枠{n}の画像を空にする"
      title="画像を空にする">空</button>
    <button class="danger" onclick={() => viewer.removeSlot(slot)} disabled={viewer.slots.length <= 1}
      aria-label="枠{n}を削除" title="枠を削除">×</button>
  </div>
</div>

<style>
  /* ---------- 見出し ---------- */

  .slot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .slot-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12px;
    color: var(--muted);
  }

  .slot-head b {
    color: var(--ink);
    font-weight: 700;
  }

  .n {
    font-family: var(--f-num);
    font-variant-numeric: tabular-nums;
  }

  /* ---------- 枠・画像 ---------- */

  .frame {
    position: relative;
    aspect-ratio: var(--ratio);
    background: var(--frame);
    border-radius: 8px;
    overflow: hidden;
    outline: 2px dashed transparent;
    outline-offset: -2px;
    transition: outline-color .15s;
  }

  .frame.drag {
    outline-color: var(--accent);
  }

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: var(--fit);
    display: block;
  }

  img.in {
    animation: fade .28s ease;
  }

  @keyframes fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    img.in {
      animation: none;
    }
  }

  .empty {
    position: absolute;
    inset: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
    padding: 8px;
    border: 1px dashed var(--line);
    border-radius: 8px;
    background: transparent;
  }

  .empty strong {
    font-family: var(--f-num);
    font-size: 26px;
    color: var(--line);
  }

  .lockbadge {
    position: absolute;
    top: 6px;
    left: 6px;
    background: var(--ink);
    color: var(--surface);
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 99px;
  }

  /* ---------- 操作ボタン ---------- */

  .slot-ctl {
    display: flex;
    gap: 4px;
  }

  .slot-ctl button,
  .slot-ctl .filebtn {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    padding: 4px 0;
    font-size: 12px;
    justify-content: center;
    text-align: center;
  }

  /* ---------- 全画面時 ---------- */

  /* 操作類を隠す */
  :global(.stage:fullscreen) .slot-head,
  :global(.stage:fullscreen) .slot-ctl,
  :global(.stage:fullscreen) .lockbadge {
    display: none;
  }

  :global(.stage:fullscreen) .frame {
    background: #111;
    border-radius: 4px;
  }

  :global(.stage:fullscreen) .empty {
    border-color: #333;
  }
</style>
