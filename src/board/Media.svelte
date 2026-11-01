<script>
  // カードの画像・動画。切り替え時は前の表示を残したまま上に重ね、
  // 新しいほうの準備ができてからフェードインする（一瞬消えるのを防ぐ）
  import { untrack } from 'svelte';

  let { src, video = false } = $props();

  const FADE = 350; // ms。CSS の animation と合わせる

  let layers = $state([]);
  let seq = 0;

  $effect(() => {
    const layer = { id: ++seq, src, video, ready: false };
    untrack(() => { layers = [...layers, layer]; });
  });

  // 準備ができたら表示し、フェード後に下の古い層を消す
  function ready(id) {
    const l = layers.find((x) => x.id === id);
    if (!l || l.ready) return;
    l.ready = true;
    setTimeout(() => { layers = layers.filter((x) => x.id >= id); }, FADE);
  }
</script>

{#each layers as l (l.id)}
  {#if l.video}
    <video src={l.src} class:in={l.ready} autoplay muted loop playsinline
      onloadeddata={() => ready(l.id)} onerror={() => ready(l.id)}></video>
  {:else}
    <img src={l.src} alt="" class:in={l.ready} onload={() => ready(l.id)} onerror={() => ready(l.id)} />
  {/if}
{/each}

<style>
  img,
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: var(--fit);
    display: block;
    opacity: 0;
  }

  .in {
    opacity: 1;
    animation: fade .35s ease;
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
</style>
