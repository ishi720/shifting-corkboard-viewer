<script>
  import { viewer, NAME_MAX } from '../lib/viewer.svelte.js';

  let { slot, index, onedit } = $props();

  let input;
  let dragging = $state(false);
  let naming = $state(false); // 名前を編集中か
  let draft = $state('');

  // ---- 名前の変更（Enter・フォーカスを外すと確定、Esc で取り消し） ----
  function startNaming() {
    draft = slot.name ?? '';
    naming = true;
  }
  function endNaming(save) {
    if (!naming) return;
    naming = false;
    if (save) viewer.renameSlot(slot, draft);
  }
  function onNameKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); endNaming(true); }
    else if (e.key === 'Escape') { e.preventDefault(); endNaming(false); }
  }
  const autofocus = (el) => { el.focus(); el.select(); };

  const len = $derived(slot.imgs.length);
  const k = $derived(viewer.shown(slot));
  const src = $derived(len ? viewer.url(slot.imgs[k]) : null);
  const video = $derived(len && viewer.isVideo(slot.imgs[k]));
  const n = $derived(index + 1);

  const hasFiles = (e) => e.dataTransfer.types.includes('Files');

  // ---- 画像ファイルのドロップ ----
  function onFileOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
  }
  function onDrop(e) {
    if (!hasFiles(e)) return;
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

<div
  class="slot"
  role="listitem"
>
  <div class="slot-head">
    {#if naming}
      <input class="name-input" bind:value={draft} maxlength={NAME_MAX} placeholder="枠 {n}"
        aria-label="枠{n}の名前" onkeydown={onNameKey} onblur={() => endNaming(true)} {@attach autofocus} />
    {:else}
      <!-- ダブルクリックはマウス用の近道。キーボードでは ✎ ボタンで変更できる -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <b class="name" title="ドラッグで並べ替え・ダブルクリックで名前を変更" ondblclick={startNaming}>⠿ {viewer.label(slot)}</b>
      <button class="rename" onclick={startNaming} aria-label="枠{n}の名前を変更" title="名前を変更">✎</button>
    {/if}
    <span class="n">{len ? `${k + 1} / ${len}` : '空'}</span>
  </div>

  <div
    class="frame"
    class:drag={dragging}
    role="group"
    aria-label="枠 {n}"
    ondragover={onFileOver}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    {#if len}
      <button class="open" onclick={onedit} aria-label="枠{n}の画像を編集" title="クリックで並べ替え・追加">
        {#if src}
          {#key src}
            {#if video}
              <video {src} class="in" autoplay muted loop playsinline aria-label="枠{n}の動画 {k + 1}枚目"></video>
            {:else}
              <img {src} alt="枠{n}の画像 {k + 1}枚目" class="in" draggable="false" />
            {/if}
          {/key}
        {/if}
      </button>
    {:else}
      <button class="empty" onclick={() => input.click()}>
        <strong>{n}</strong>クリックまたはドロップで画像・動画を追加
      </button>
    {/if}
  </div>

  <div class="slot-ctl">
    <button onclick={() => viewer.stepSlot(slot, -1)} disabled={!len} aria-label="枠{n}を前へ">◀</button>
    <button onclick={() => viewer.stepSlot(slot, 1)} disabled={!len} aria-label="枠{n}を次へ">▶</button>
    <span class="filebtn" title="この枠に画像・動画を追加">＋<input
        bind:this={input} type="file" accept="image/*,video/*" multiple
        aria-label="枠{n}に画像・動画を追加" onchange={onPick} /></span>
    <button class="danger" onclick={() => { if (confirm(`「${viewer.label(slot)}」を削除します。含まれるデータも消えますが、よろしいですか？`)) viewer.removeSlot(slot); }}
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
    align-items: center;
    gap: 2px;
    min-height: 24px;
    font-size: 12px;
    color: var(--muted);
  }

  /* 長い名前は省略 */
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
    font-weight: 700;
    cursor: grab;
  }

  /* 名前の変更ボタンはホバー・フォーカス時だけ出す */
  .rename {
    flex: none;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    line-height: 1;
    opacity: 0;
  }

  .slot:hover .rename,
  .rename:focus-visible {
    opacity: 1;
  }

  .rename:hover {
    color: var(--accent);
  }

  .name-input {
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    font: inherit;
    font-weight: 700;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: 5px;
  }

  .slot-head .n {
    margin-left: auto;
    padding-left: 6px;
    flex: none;
  }

  @media (hover: none) {
    .rename {
      opacity: 1;
    }
  }

  /* ---------- 並べ替え（SortableJS が付けるクラス） ---------- */

  /* 置き場所の目印。つかんだ枠のあった場所にごく薄く残る */
  .slot:global(.sort-ghost) {
    opacity: .15;
  }
  /* つかんで動かしている枠。くっきり見せる（Sortable が付ける半透明を打ち消す） */
  .slot:global(.sort-drag) {
    opacity: 1 !important;
    filter: drop-shadow(0 10px 18px rgba(0, 0, 0, .28));
  }
  .slot:global(.sort-ghost) .frame {
    outline: 2px dashed var(--accent);
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

  .open {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
  }

  img,
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: var(--fit);
    display: block;
  }

  .in {
    animation: fade .28s ease;
  }

  @keyframes fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .in {
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
</style>
