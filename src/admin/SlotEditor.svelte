<script>
  // 枠1つの中身の編集（並べ替え・追加・削除・表示する画像の選択）
  import { viewer } from '../lib/viewer.svelte.js';
  import { sortable } from '../lib/sortable.js';

  let { slotId, onclose } = $props();

  let dialog;
  let dropping = $state(false);

  const index = $derived(viewer.slots.findIndex((s) => s.id === slotId));
  const slot = $derived(viewer.slots[index]);
  const k = $derived(slot ? viewer.shown(slot) : 0);

  const hasFiles = (e) => e.dataTransfer.types.includes('Files');

  $effect(() => {
    if (slotId && !dialog.open) dialog.showModal();
    if (!slotId && dialog.open) dialog.close();
  });
  // 枠が削除されたら閉じる
  $effect(() => { if (slotId && !slot) onclose(); });

  // ---- 画像ファイルの追加 ----
  function onFileOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropping = true;
  }
  function onFileDrop(e) {
    e.preventDefault();
    e.stopPropagation(); // 操作画面全体への配布にしない
    dropping = false;
    if (hasFiles(e)) viewer.addTo(slot, e.dataTransfer.files);
  }
  function onPick(e) {
    viewer.addTo(slot, e.currentTarget.files);
    e.currentTarget.value = '';
  }

  // 背景クリックで閉じる
  function onBackdrop(e) { if (e.target === dialog) dialog.close(); }
</script>

<dialog
  bind:this={dialog}
  class:dropping
  aria-labelledby="slot-editor-title"
  onclose={onclose}
  onclick={onBackdrop}
  ondragover={onFileOver}
  ondragleave={(e) => { if (!dialog.contains(e.relatedTarget)) dropping = false; }}
  ondrop={onFileDrop}
>
  {#if slot}
    <header>
      <h2 id="slot-editor-title">{viewer.label(slot)} の画像 <small>{slot.imgs.length}枚</small></h2>
      <button onclick={() => dialog.close()} aria-label="閉じる">×</button>
    </header>

    <p class="hint">ドラッグで並べ替え、クリックでその画像を表示します。画像・動画ファイルをここへドロップすると末尾に追加されます。</p>

    {#if slot.imgs.length}
      <ol class="thumbs" {@attach sortable({ draggable: '.thumb', onmove: (a, b) => viewer.moveImage(slot, a, b) })}>
        {#each slot.imgs as id, i (id)}
          <li
            class="thumb"
            class:current={i === k}
          >
            <button class="pick" onclick={() => viewer.showImage(slot, i)}
              aria-label="{i + 1}枚目を表示" aria-current={i === k}>
              {#if viewer.isVideo(id)}
                <video src={viewer.url(id)} muted preload="metadata"></video>
              {:else}
                <img src={viewer.url(id)} alt="" draggable="false" />
              {/if}
            </button>
            <span class="num">{i + 1}</span>
            <button class="del" onclick={() => viewer.removeImage(slot, i)}
              aria-label="{i + 1}枚目を削除" title="この画像を削除">×</button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="none">まだ画像がありません</p>
    {/if}

    <footer>
      <span class="filebtn primary">＋ 画像・動画を追加<input type="file" accept="image/*,video/*" multiple
          aria-label="枠{index + 1}に画像・動画を追加" onchange={onPick} /></span>
      <button onclick={() => dialog.close()}>閉じる</button>
    </footer>
  {/if}
</dialog>

<style>
  /* ---------- ダイアログ ---------- */

  dialog {
    width: min(880px, calc(100vw - 32px));
    max-height: calc(100svh - 48px);
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    outline: 2px dashed transparent;
    outline-offset: -8px;
  }

  dialog.dropping {
    outline-color: var(--accent);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, .45);
  }

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  footer {
    justify-content: flex-end;
    margin-top: 14px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  h2 small {
    margin-left: 6px;
    font-family: var(--f-num);
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }

  .hint,
  .none {
    margin: 6px 0 12px;
    font-size: 12px;
    color: var(--muted);
  }

  .none {
    padding: 32px 0;
    text-align: center;
  }

  /* ---------- サムネイル ---------- */

  .thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .thumb {
    position: relative;
    aspect-ratio: var(--ratio);
    border-radius: 6px;
    background: var(--frame);
    outline: 2px solid transparent;
    outline-offset: 2px;
    cursor: grab;
  }

  .thumb.current {
    outline-color: var(--ink);
  }

  /* 並べ替えの置き場所の目印（SortableJS が付けるクラス） */
  .thumb:global(.sort-ghost) {
    opacity: .15;
    outline: 2px dashed var(--accent);
  }
  /* つかんで動かしている画像。くっきり見せる（Sortable が付ける半透明を打ち消す） */
  .thumb:global(.sort-drag) {
    opacity: 1 !important;
    box-shadow: 0 10px 18px rgba(0, 0, 0, .28);
  }

  .pick {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    cursor: inherit;
  }

  .pick img,
  .pick video {
    width: 100%;
    height: 100%;
    object-fit: var(--fit);
    display: block;
  }

  .num {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 0 6px;
    border-radius: 99px;
    background: rgba(0, 0, 0, .6);
    color: #fff;
    font-family: var(--f-num);
    font-size: 11px;
    pointer-events: none;
  }

  .del {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, .6);
    color: #fff;
    font-size: 13px;
    line-height: 22px;
    opacity: 0;
    transition: opacity .15s;
  }

  .thumb:hover .del,
  .del:focus-visible {
    opacity: 1;
  }

  .del:hover {
    background: var(--danger);
  }

  @media (hover: none) {
    .del {
      opacity: 1;
    }
  }
</style>
