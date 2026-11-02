<script>
  import { onMount, untrack } from 'svelte';
  import { viewer } from '../lib/viewer.svelte.js';
  import Media from './Media.svelte';

  let W = $state(1200);
  let H = $state(800);
  let hudVisible = $state(true);
  let hudTimer;
  let fullscreen = $state(false);

  const PAD = 8; // カードの白縁(px)

  const ratioNum = $derived.by(() => {
    const [a, b] = String(viewer.ratio).split('/').map(Number);
    return a && b ? a / b : 5 / 8;
  });

  // 画像のある枠だけ貼る
  const cards = $derived(viewer.slots.filter((s) => s.imgs.length));

  // カードが最大になる列数と幅
  const layout = $derived.by(() => {
    const n = Math.max(1, cards.length);
    // ずらす余地のため余白・間隔は広め
    const margin = Math.max(28, Math.min(W, H) * 0.075);
    const gap = Math.max(22, Math.min(W, H) * 0.06);
    const aw = W - margin * 2, ah = H - margin * 2;
    let best = { cols: 1, w: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const byW = (aw - (c - 1) * gap) / c;
      const byH = ((ah - (r - 1) * gap) / r - PAD * 2) * ratioNum + PAD * 2;
      const w = Math.min(byW, byH);
      if (w > best.w) best = { cols: c, w };
    }
    return { ...best, gap };
  });

  // ---- 配置のゆらぎ ----
  // 枠IDを乱数の種にするので、再読み込みしても同じ配置
  const PINS = ['#D2453A', '#2F6FD0', '#E2B33B', '#3E9A5B', '#8B5CC9', '#E07A2E'];
  const TAPES = ['rgba(236,226,196,.82)', 'rgba(214,232,226,.8)', 'rgba(240,214,214,.8)'];

  function rng(id) {
    let h = 2166136261;
    for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { // mulberry32
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const spread = (r) => r * 2 - 1; // 0..1 → -1..1

  function look(id) {
    const r = rng(id);
    // 傾き 0.4〜3.8°。小さめが多い
    const tilt = (r() < 0.5 ? -1 : 1) * (0.4 + Math.pow(r(), 1.6) * 3.4);
    const dx = spread(r()) * 0.45;   // gap に対する割合
    const dy = spread(r()) * 0.5;
    const scale = 0.95 + r() * 0.06;
    const tape = r() < 0.3;          // 約3割はテープ留め
    return {
      rot: tilt, dx, dy, scale, tape,
      pin: PINS[Math.floor(r() * PINS.length)],
      pinX: 50 + spread(r()) * 16,   // ピン位置(%)
      tapeColor: TAPES[Math.floor(r() * TAPES.length)],
      tapeRot: spread(r()) * 9,
      z: Math.floor(r() * 10),
    };
  }

  function wake() {
    hudVisible = true;
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => (hudVisible = false), 2500);
  }

  async function toggleFs() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* 非対応環境は無視 */ }
  }

  // 画面上のボタンは全画面だけ。切り替え・再生はキー操作で
  function onKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); viewer.step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewer.step(-1); }
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === 'r' || e.key === 'R') viewer.setShuffle(!viewer.shuffle);
    else if (e.key === ' ' || e.key === 'l' || e.key === 'L') { e.preventDefault(); viewer.setPlay(!viewer.playing); }
    wake();
  }

  $effect(() => {
    document.documentElement.style.setProperty('--fit', viewer.fit);
  });

  // 再生を始めたら動画を頭から（動画の長さで枠を進めるタイミングと合わせる）
  $effect(() => {
    if (viewer.playing) untrack(() => document.querySelectorAll('.photo video').forEach((v) => { v.currentTime = 0; }));
  });

  onMount(() => {
    viewer.init({ player: true });
    wake();
    return () => clearTimeout(hudTimer);
  });
</script>

<!-- 右クリックメニュー・画像のドラッグは出さない -->
<svelte:window bind:innerWidth={W} bind:innerHeight={H} onkeydown={onKey} onmousemove={wake}
  oncontextmenu={(e) => e.preventDefault()} ondragstart={(e) => e.preventDefault()} />
<svelte:document onfullscreenchange={() => { fullscreen = !!document.fullscreenElement; }} />

<!-- 全画面時は操作パネルと一緒にカーソルも隠す -->
<main class="cork" class:idle={fullscreen && !hudVisible} ondblclick={toggleFs}>
  {#if viewer.ready && !cards.length}
    <!-- ピンから吊るしたカード。ゆっくり揺れる -->
    <div class="soon">
      <span class="pin" style:--pin="#D2453A" style:--pin-x="50%" aria-hidden="true"></span>
      <p class="soon-title">Coming soon</p>
      <svg class="soon-line" viewBox="0 0 200 14" aria-hidden="true">
        <path d="M4 9 C 50 3, 90 13, 130 7 S 185 5, 196 8" />
      </svg>
      <p class="soon-sub">ただいま準備中です</p>
    </div>
  {:else if viewer.ready}
    <div class="board" style:width="{layout.cols * layout.w + (layout.cols - 1) * layout.gap}px" style:--w="{layout.w}px" style:gap="{layout.gap}px">
      {#each cards as slot (slot.id)}
        {@const lk = look(slot.id)}
        {@const src = viewer.url(slot.imgs[viewer.cur(slot)])}
        <figure class="card" style:--rot="{lk.rot}deg" style:--dx="{lk.dx * layout.gap}px" style:--dy="{lk.dy * layout.gap}px"
          style:--s={lk.scale} style:z-index={lk.z} style:--pin={lk.pin} style:--pin-x="{lk.pinX}%"
          style:--tape={lk.tapeColor} style:--tape-rot="{lk.tapeRot}deg"
          style:--pad="{PAD}px" style:aspect-ratio="{layout.w} / {(layout.w - PAD * 2) / ratioNum + PAD * 2}">
          {#if lk.tape}<span class="tape" aria-hidden="true"></span>{:else}<span class="pin" aria-hidden="true"></span>{/if}
          <div class="photo">
            {#if src}
              <Media {src} video={viewer.isVideo(slot.imgs[viewer.cur(slot)])} />
            {/if}
          </div>
        </figure>
      {/each}
    </div>
  {/if}

  <!-- 全画面ボタン。マウスを動かすと出る。全画面中は出さない（F キー・ダブルクリックで戻る） -->
  {#if viewer.ready && cards.length && !fullscreen}
    <button class="hud" class:show={hudVisible} onclick={toggleFs} ondblclick={(e) => e.stopPropagation()}
      aria-label="全画面" title="全画面（F）">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      </svg>
    </button>
  {/if}
</main>

<style>
  :global(body) {
    padding: 0;
    overflow: hidden;
    background: #9C6B3F;
  }

  /* ---------- コルクボード ---------- */

  /* コルク：木枠 + SVGノイズ + 明暗 */
  .cork {
    --frame-w: clamp(8px, 1.4vmin, 16px);

    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    -webkit-user-select: none;
            user-select: none;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .32 0 0 0 0 .19 0 0 0 0 .08 0 0 0 1.6 -.55'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.025' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .9 0 0 0 0 .75 0 0 0 .5 -.12'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E"),
      radial-gradient(ellipse at 50% 40%, #C79868 0%, #B7854F 55%, #9E6E40 100%);
    box-shadow:
      inset 0 0 0 var(--frame-w) #6B4527,
      inset 0 0 0 calc(var(--frame-w) + 2px) #4E301A,
      inset 0 0 60px rgba(40, 20, 5, .45);
  }

  .cork.idle,
  .cork.idle * {
    cursor: none;
  }

  /* 折り返し、最終段は中央寄せ */
  .board {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
  }

  .board > .card {
    width: var(--w);
    flex: none;
  }

  /* ---------- カード・写真 ---------- */

  .card {
    position: relative;
    margin: 0;
    background: #FBFAF6;
    padding: var(--pad);
    border-radius: 2px;
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(var(--s));
    transition: transform .6s cubic-bezier(.2, .8, .2, 1);
    box-shadow:
      0 1px 1px rgba(0, 0, 0, .18),
      0 6px 14px rgba(40, 20, 5, .32),
      0 18px 30px -12px rgba(40, 20, 5, .35);
  }

  .photo {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #E8E3D8;
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }

  /* ---------- 留め具 ---------- */

  /* ピン */
  .pin {
    position: absolute;
    top: -7px;
    left: var(--pin-x);
    z-index: 2;
    width: 18px;
    height: 18px;
    margin-left: -9px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgba(255, 255, 255, .75) 0 2.5px, transparent 4px),
      radial-gradient(circle at 50% 50%, var(--pin) 0 60%, color-mix(in srgb, var(--pin), #000 35%) 100%);
    box-shadow: 2px 4px 4px rgba(30, 15, 5, .45);
  }

  /* マスキングテープ（端はギザギザ） */
  .tape {
    --jagged:
      conic-gradient(from -45deg at left, #0000 25%, #000 0) left / 51% 6px repeat-y,
      conic-gradient(from 135deg at right, #0000 25%, #000 0) right / 51% 6px repeat-y;

    position: absolute;
    top: -11px;
    left: 50%;
    z-index: 2;
    width: clamp(48px, 34%, 110px);
    height: 22px;
    transform: translateX(-50%) rotate(var(--tape-rot));
    background: var(--tape);
    box-shadow: 0 1px 2px rgba(30, 15, 5, .18);
    -webkit-mask: var(--jagged);
            mask: var(--jagged);
  }

  /* ---------- 未登録時の付箋 ---------- */

  /* 罫線入りの紙 */
  .soon {
    position: relative;
    width: min(440px, 82vw);
    padding: clamp(28px, 6vmin, 44px) clamp(24px, 6vmin, 48px) clamp(22px, 5vmin, 36px);
    background:
      repeating-linear-gradient(transparent 0 27px, rgba(47, 111, 208, .12) 27px 28px),
      linear-gradient(#FBFAF6, #F3EFE4);
    color: #3D3420;
    text-align: center;
    border-radius: 2px;
    transform-origin: 50% 0;
    animation: sway 6s ease-in-out infinite;
    box-shadow:
      0 1px 1px rgba(0, 0, 0, .18),
      0 10px 20px rgba(40, 20, 5, .35),
      0 26px 40px -16px rgba(40, 20, 5, .4);
  }

  .soon-title {
    margin: 0;
    font-family: "Caveat", var(--f-ui);
    font-size: clamp(44px, 11vmin, 72px);
    font-weight: 600;
    line-height: 1.05;
  }

  .soon-line {
    display: block;
    width: 70%;
    height: 14px;
    margin: 4px auto 14px;
    fill: none;
    stroke: #D2453A;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 220;
    stroke-dashoffset: 220;
    animation: draw 1.2s .3s ease-out forwards;
  }

  .soon-sub {
    margin: 0;
    font-family: var(--f-ui);
    font-size: 13px;
    letter-spacing: .2em;
    color: #8A7A5C;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(-2deg); }
    50%      { transform: rotate(1deg); }
  }

  @keyframes draw {
    to { stroke-dashoffset: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .soon {
      animation: none;
      transform: rotate(-1.5deg);
    }

    .soon-line {
      animation: none;
      stroke-dashoffset: 0;
    }
  }

  /* ---------- 全画面ボタン（右上。マウス操作で表示） ---------- */

  .hud {
    position: fixed;
    top: max(20px, env(safe-area-inset-top, 0px));
    right: max(20px, env(safe-area-inset-right, 0px));
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 99px;
    background: rgba(30, 18, 8, .72);
    color: #F4EAD9;
    backdrop-filter: blur(4px);
    opacity: 0;
    transition: opacity .4s, background .2s;
  }

  .hud.show,
  .hud:hover,
  .hud:focus-visible {
    opacity: 1;
  }

  .hud:hover {
    background: rgba(30, 18, 8, .9);
  }

  .hud svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
