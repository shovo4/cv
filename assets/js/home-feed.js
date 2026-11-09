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

  /* ---------- top nav: sliding indicator + scroll-spy ---------- */
  (function () {
    var menu = document.querySelector('.header-area .navbar .menu'); if (!menu) return;
    var links = Array.prototype.slice.call(menu.querySelectorAll('li a[href^="#"]'));
    var glider = document.createElement('span'); glider.className = 'nav-glider'; menu.appendChild(glider);
    var current = null, hovering = false;
    function place(li) {
      if (!li || innerWidth < 768) { glider.style.opacity = 0; return; }
      glider.style.width = li.offsetWidth + 'px'; glider.style.transform = 'translateX(' + li.offsetLeft + 'px)'; glider.style.opacity = 1;
    }
    function setActive(li) {
      links.forEach(function (a) { a.parentElement.classList.toggle('is-active', a.parentElement === li); });
      current = li; if (!hovering) place(li);
    }
    // hover: glider follows the pointer, returns to the active item on leave
    links.forEach(function (a) {
      a.addEventListener('mouseenter', function () { hovering = true; place(a.parentElement); });
      a.addEventListener('click', function () { setActive(a.parentElement); });
    });
    menu.addEventListener('mouseleave', function () { hovering = false; place(current); });
    // scroll-spy: which section is on screen
    var map = {};
    links.forEach(function (a) { var t = document.querySelector(a.getAttribute('href')); if (t) map[t.id] = a.parentElement; });
    var visible = {};
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
        var best = null, bestR = 0;
        Object.keys(visible).forEach(function (id) { if (visible[id] > bestR) { bestR = visible[id]; best = id; } });
        if (best && map[best] && map[best] !== current) setActive(map[best]);
        else if (!best && current && scrollY < 200) { links.forEach(function (a) { a.parentElement.classList.remove('is-active'); }); current = null; place(null); }
      }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, .1, .25, .5, .75, 1] });
      Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
    }
    addEventListener('resize', function () { place(current); });
  })();

  /* ---------- project filter bar: icons + counts + sliding highlight ---------- */
  (function () {
    var bar = document.querySelector('.projects-area .sticky-navbar'); if (!bar) return;
    var icons = { all: '✦', frontend: '🎨', backend: '⚙️', database: '🗄️', devops: '🚀', ml: '🧠', design: '✏️' };
    var cards = document.querySelectorAll('.projects-area .project-item');
    bar.classList.add('pf-bar');
    var glider = document.createElement('span'); glider.className = 'pf-glider'; bar.appendChild(glider);
    bar.querySelectorAll('.skill-filter').forEach(function (a) {
      var k = a.dataset.skill, n = k === 'all' ? cards.length : Array.prototype.filter.call(cards, function (c) { return (c.dataset.skill || '').split(/\s+/).indexOf(k) !== -1; }).length;
      a.innerHTML = '<span class="pf-ico">' + (icons[k] || '•') + '</span><span class="pf-label">' + a.textContent.trim() + '</span><span class="pf-count">' + n + '</span>';
    });
    function moveGlider() {
      var on = bar.querySelector('.skill-filter.active'); if (!on) return;
      glider.style.width = on.offsetWidth + 'px'; glider.style.transform = 'translateX(' + on.offsetLeft + 'px)'; glider.style.opacity = 1;
    }
    bar.addEventListener('click', function () { setTimeout(moveGlider, 0); });
    addEventListener('resize', moveGlider);
    var panel = document.getElementById('projects-panel');
    if (panel) new MutationObserver(moveGlider).observe(panel, { attributes: true, attributeFilter: ['class'] });
    setTimeout(moveGlider, 50);
    // stagger the cards back in whenever the filter changes
    bar.addEventListener('click', function () {
      setTimeout(function () {
        var i = 0;
        cards.forEach(function (c) { if (c.style.display !== 'none') { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = 'pf-in .4s ' + (i++ * 40) + 'ms both'; } });
      }, 0);
    });
  })();

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
