/* Recent blog posts + memories for the home page, plus the "More about me" toggle */
(function () {
  /* ---------- More about me ---------- */
  var more = document.getElementById('more-about'), btn = document.getElementById('more-toggle');
  function refreshAnim() { try { if (window.AOS) { (AOS.refreshHard || AOS.refresh)(); } } catch (e) {} }
  function setOpen(open, scroll) {
    if (!more || !btn) return;
    more.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.innerHTML = open ? 'Show less &uarr;' : 'More about me &darr;';
    refreshAnim();
    if (open && scroll) setTimeout(function () { more.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }
  if (btn) btn.addEventListener('click', function () { setOpen(!more.classList.contains('open'), true); });

  // links that point inside the hidden area (nav "Experiences & Skills", etc.) open it first
  var inside = ['#experience', '#education', '#certificates', '#skills'];
  function openFor(hash, smooth) {
    if (inside.indexOf(hash) === -1 || !more) return false;
    setOpen(true, false);
    setTimeout(function () { var t = document.querySelector(hash); if (t) t.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); }, 80);
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && openFor(a.getAttribute('href'), true)) e.preventDefault();
  });
  if (location.hash) openFor(location.hash, false);

  /* ---------- recent posts + memories ---------- */
  if (!window.Blog) return;
  var B = window.Blog, esc = B.esc, fmt = B.fmtDate, sb = B.sb;

  (async function () {
    var box = document.getElementById('hx-blog'), moreBtn = document.getElementById('hx-blog-more');
    try {
      var r = await sb.from('posts').select('id,title,excerpt,cover_url,created_at').eq('published', true).order('created_at', { ascending: false }).limit(4);
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) { box.innerHTML = '<p class="hx-status">No posts yet. Check back soon.</p>'; return; }
      box.innerHTML = rows.slice(0, 3).map(function (p) {
        return '<a class="hx-card" href="./post.html?id=' + encodeURIComponent(p.id) + '"><div class="hx-thumb">' +
          (p.cover_url ? '<img loading="lazy" src="' + esc(p.cover_url) + '" alt="">' : '') + '</div><div class="hx-info"><h3>' + esc(p.title) + '</h3>' +
          (p.excerpt ? '<p>' + esc(p.excerpt) + '</p>' : '') + '<div class="hx-meta">' + fmt(p.created_at) + '</div></div></a>';
      }).join('');
      if (rows.length > 3) moreBtn.style.display = '';
    } catch (e) { box.innerHTML = '<p class="hx-status">Couldn\'t load posts right now.</p>'; }
    refreshAnim();
  })();

  (async function () {
    var box = document.getElementById('hx-mem'), moreBtn = document.getElementById('hx-mem-more');
    try {
      var r = await sb.from('memories').select('id,caption,image_url').order('taken_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(9);
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) { box.innerHTML = '<p class="hx-status">No memories yet.</p>'; return; }
      box.innerHTML = rows.slice(0, 8).map(function (m) {
        return '<a class="hx-mem" href="./memories.html"><img loading="lazy" src="' + esc(m.image_url) + '" alt="' + esc(m.caption || 'Memory') + '">' +
          (m.caption ? '<span>' + esc(m.caption) + '</span>' : '') + '</a>';
      }).join('');
      if (rows.length > 8) moreBtn.style.display = '';
    } catch (e) { box.innerHTML = '<p class="hx-status">Couldn\'t load memories right now.</p>'; }
    refreshAnim();
  })();
})();
