// Minimal theme: footer year auto-update.
// 既存の renderer.js を変更せずに、footer の年だけ補助的に更新します。
(function () {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
})();
