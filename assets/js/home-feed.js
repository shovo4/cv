/* Home page: collapsible sections + recent blog posts and memories */
(function () {
  function refreshAnim() { try { if (window.AOS) (AOS.refreshHard || AOS.refresh)(); } catch (e) {} }

  /* ---------- collapsible sections ---------- */
  var toggles = document.querySelectorAll('.hx-toggle');
  function setPanel(btn, open) {
    var panel = document.getElementById(btn.dataset.target); if (!panel) return;
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = btn.closest('.hx-collapse-head').querySelector('.hx-heading').textContent.trim().toLowerCase();
    btn.innerHTML = (open ? 'Hide ' : 'Show ') + label + (open ? ' &uarr;' : ' &darr;');
    refreshAnim();
  }
  toggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = document.getElementById(btn.dataset.target);
      setPanel(btn, !panel.classList.contains('open'));
    });
  });

  // which anchors live inside which collapsed panel
  var inside = {
    '#skills-block': 'skills-panel', '#experience': 'skills-panel', '#education': 'skills-panel', '#certificates': 'skills-panel', '#skills': 'skills-panel',
    '#projects-block': 'projects-panel', '#projects': 'projects-panel'
  };
  function openFor(hash, smooth) {
    var panelId = inside[hash]; if (!panelId) return false;
    var btn = document.querySelector('.hx-toggle[data-target="' + panelId + '"]');
    if (btn) setPanel(btn, true);
    setTimeout(function () {
      var t = document.querySelector(hash); if (t) t.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }, 60);
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('skill-filter')) return;        // project filter tabs stay as they are
    if (openFor(a.getAttribute('href'), true)) e.preventDefault();
  });
  if (location.hash) openFor(location.hash, false);

  // mobile: close the menu after choosing a link
  document.querySelectorAll('.header-area .navbar .menu a').forEach(function (a) {
    a.addEventListener('click', function () {
      document.querySelector('.header-area .navbar').classList.remove('active');
      var sm = document.querySelector('.header-area .show-menu'); if (sm) sm.classList.remove('active');
    });
  });

  /* ---------- recent posts + memories ---------- */
  if (!window.Blog) {
    ['hx-blog','hx-mem'].forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = '<p class="hx-status">Couldn\'t load right now.</p>'; });
    return;
  }
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
