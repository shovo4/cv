/* Home page: collapsible sections + recent blog posts and memories */
(function () {
  var top = document.querySelector('.hx-top'); if (top) top.addEventListener('click', function (e) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
  var y = document.getElementById('hx-year'); if (y) y.textContent = new Date().getFullYear();
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

  /* ---------- project cards: tech list -> chips, drive links ---------- */
  document.querySelectorAll('.projects-area .project-item').forEach(function (card) {
    // normalise the card: image -> title -> tags -> buttons (the original markup varied)
    var overlay = card.querySelector('.overlay-link');
    var img = card.querySelector('.project-img img') || card.querySelector(':scope > img:not(.bg-img)');
    var h1 = card.querySelector('.project-info h1'), tags = card.querySelector('.project-info p');
    var btns = Array.prototype.slice.call(card.querySelectorAll('.project-btn'));
    if (img && h1) {
      var info = document.createElement('div'); info.className = 'project-info';
      info.appendChild(h1); if (tags) info.appendChild(tags);
      var actions = document.createElement('div'); actions.className = 'project-actions';
      btns.forEach(function (b) { actions.appendChild(b); });
      card.innerHTML = '';
      if (overlay) card.appendChild(overlay);
      img.className = 'project-cover'; img.removeAttribute('width'); img.removeAttribute('height'); img.loading = 'lazy';
      card.appendChild(img); card.appendChild(info); card.appendChild(actions);
    }
    var p = card.querySelector('.project-info p');
    if (p && !p.querySelector('.tag')) {
      var items = p.textContent.split(/,(?![^(]*\))/).map(function (t) { return t.trim(); }).filter(Boolean);
      if (items.length) p.innerHTML = items.map(function (t) { return '<span class="tag">' + t.replace(/</g, '&lt;') + '</span>'; }).join('');
    }
    card.querySelectorAll('.project-btn').forEach(function (b) { if (!/github/i.test(b.textContent)) b.classList.add('is-drive'); });
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
    } catch (e) { box.innerHTML = '<p class="hx-status">Couldn\'t load memories right now.</p>'; }
    refreshAnim();
  })();
})();
