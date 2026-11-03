// Google アナリティクス（GA4）。ビルド時に VITE_GA_ID が設定されているときだけ読み込む
//   ローカル開発など、未設定の環境では何も送らない

const id = import.meta.env.VITE_GA_ID;

if (id) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id);
}
