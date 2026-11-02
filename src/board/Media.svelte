<script>
  // カードの画像・動画。切り替え時は前の表示を残したまま上に重ね、
  // 新しいほうの準備ができてからフェードインする（一瞬消えるのを防ぐ）
  import { untrack } from 'svelte';

  // held: 動画を停止中か。ontoggle(停止するか, 再生位置秒) でクリックを伝える
  let { src, video = false, held = false, ontoggle } = $props();

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

  // 停止状態は共有の状態に合わせる
  $effect(() => {
    const v = layers.at(-1)?.el;
    if (!v) return;
    if (held) v.pause();
    else v.play().catch(() => {});
  });

  // 動画はクリックで停止・再生
  function toggle(e) {
    const v = e.currentTarget;
    ontoggle?.(!v.paused, v.currentTime);
  }
</script>

{#each layers as l (l.id)}
  {#if l.video}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <video src={l.src} class:in={l.ready} autoplay muted loop playsinline onclick={toggle} bind:this={l.el}
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
