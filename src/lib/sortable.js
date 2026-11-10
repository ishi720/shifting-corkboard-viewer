// ドラッグでの並べ替え（SortableJS）。Svelte の {@attach} で使う
//   並べ替え中はほかの要素がアニメーションでよける
//   並べ替え後は DOM を元に戻してから onmove(from, to) を呼ぶ（並び自体は状態から描き直す）
import Sortable from 'sortablejs';

/** @param {{ onmove: (from: number, to: number) => void } & Sortable.Options} options */
export function sortable({ onmove, ...options }) {
  return (el) => {
    let next = null; // つかんだ要素の元の次のノード（戻す位置）
    const s = Sortable.create(el, {
      animation: 200,
      easing: 'cubic-bezier(.2, .8, .2, 1)',
      ghostClass: 'sort-ghost',
      chosenClass: 'sort-chosen',
      // ブラウザ標準のドラッグ画像は半透明で変えられないので、自前の複製を動かす
      forceFallback: true,
      fallbackClass: 'sort-drag',
      fallbackTolerance: 3, // クリックと区別するため、3px 動いてからドラッグ開始
      // 入力欄ではドラッグを始めず、文字の選択などをそのまま使う
      filter: 'input, select, textarea',
      preventOnFilter: false,
      ...options,
      onChoose(e) { next = e.item.nextSibling; },
      onEnd(e) {
        const { item, from, oldDraggableIndex, newDraggableIndex } = e;
        if (oldDraggableIndex === newDraggableIndex) return;
        // Svelte が管理する DOM なので、Sortable が動かした要素を元の位置に戻す
        from.insertBefore(item, next);
        onmove(oldDraggableIndex, newDraggableIndex);
      },
    });
    return () => s.destroy();
  };
}
