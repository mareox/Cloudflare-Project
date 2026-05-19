(function () {
  function openLightbox(src, alt) {
    var overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    var btn = document.createElement('button');
    btn.className = 'lightbox-close';
    btn.textContent = '✕';
    btn.setAttribute('aria-label', 'Close');
    var img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    overlay.appendChild(btn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    btn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }
  document.querySelectorAll('.screens figure').forEach(function (fig) {
    var img = fig.querySelector('img');
    if (!img) return;
    fig.addEventListener('click', function () { openLightbox(img.src, img.alt); });
  });
})();
