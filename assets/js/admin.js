/* Admin app: auth, overview/storage, posts, memories, watched (OMDb), settings */
(() => {
  if (!window.Blog) { document.body.innerHTML = '<div class="b-status">Couldn\'t connect right now. Please refresh.</div>'; return; }
  const { sb, esc, fmtDate, renderBody, uploadImage, coverOf, ratingDonut, kindDonut } = Blog;
  const $ = id => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle('hide', !on);
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const toDateInput = iso => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fromDateInput = v => new Date(v + 'T12:00:00').toISOString();
  const fmtBytes = b => { b = Number(b) || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB'; return (b / 1073741824).toFixed(2) + ' GB'; };
  document.querySelectorAll('input[type=date]').forEach(i => i.addEventListener('click', e => { try { e.target.showPicker(); } catch (err) {} }));

  /* ---------- auth + routing ---------- */
  async function route() {
    const { data: { session } } = await sb.auth.getSession();
    show('loginView', !session); show('app', false); show('denied', false);
    if (!session) return;
    const { data: ok } = await sb.rpc('is_admin');
    if (!ok) { show('denied', true); return; }
    $('whoami').textContent = session.user.email; $('whoami').title = session.user.email;
    show('app', true); loadOverview(); loadPosts(); loadMemories(); loadWatched(); loadKey(); if (location.hash === '#files') loadFiles();
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
    if (error) { $('loginMsg').textContent = 'Wrong email or password.'; return; }
    $('pw').value = ''; route();
  });
  ['logout', 'logout2'].forEach(id => $(id).addEventListener('click', async e => { e.preventDefault(); try { localStorage.removeItem('shovo_omdb_key'); localStorage.removeItem('shovo_omdb_req'); } catch (err) {} await sb.auth.signOut(); location.reload(); }));
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') route(); });

  const titles = { overview: 'Overview', posts: 'Blog posts', memories: 'Memories', watched: 'Watched', files: 'Files', settings: 'Settings' };
  function goto(v) {
    document.querySelectorAll('.adm-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    document.querySelectorAll('.adm-view').forEach(s => s.classList.toggle('hide', s.id !== 'view-' + v));
    $('viewTitle').textContent = titles[v] || v; location.hash = v; window.scrollTo(0, 0);
    if (v === 'files' && !$('app').classList.contains('hide')) loadFiles();
  }
  document.querySelectorAll('.adm-nav button').forEach(b => b.addEventListener('click', () => goto(b.dataset.view)));
  document.addEventListener('click', e => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); goto(a.dataset.goto); } });
  if (titles[location.hash.slice(1)]) goto(location.hash.slice(1));

  /* ---------- overview ---------- */
  function gauge(pct, title, detail, c1, c2, id) {
    const r = 46, C = 2 * Math.PI * r, shown = Math.max(pct, pct > 0 ? 0.6 : 0), len = Math.min(100, shown) / 100 * C;
    const label = pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct);
    return `<div class="gauge"><svg viewBox="0 0 110 110"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <circle cx="55" cy="55" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>
      <circle class="gauge-arc" cx="55" cy="55" r="${r}" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(-90 55 55)"/></svg>
      <div class="gauge-c"><b>${label}<small>%</small></b><span>used</span></div><div class="gauge-t"><b>${title}</b><small>${detail}</small></div></div>`;
  }
  function ago(iso) {
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 172800) return 'yesterday'; if (s < 604800) return Math.floor(s / 86400) + ' days ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  async function loadOverview() {
    const now = new Date(), h = now.getHours();
    $('ovHello').textContent = (h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', Shovo';
    $('ovDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const [rep, pr, mr, wr] = await Promise.all([
      sb.rpc('admin_storage_report'),
      sb.from('posts').select('id,title,published,created_at').order('created_at', { ascending: false }),
      sb.from('memories').select('id,caption,taken_on,created_at').order('created_at', { ascending: false }).limit(50),
      sb.from('watched').select('title,kind,my_rating,watched_on,created_at').order('created_at', { ascending: false }).limit(500)
    ]);
    if (rep.error) { $('st-err').textContent = 'Storage report unavailable - run supabase/02_watched_and_storage.sql (' + rep.error.message + ')'; return; }
    const data = rep.data, c = data.counts || {}, posts = pr.data || [], mems = mr.data || [], wat = wr.data || [];
    const files = data.files || { bytes: 0, count: 0 }, FILE_CAP = 1073741824, DB_CAP = 524288000;
    const pf = files.bytes / FILE_CAP * 100, pd = data.db_bytes / DB_CAP * 100, yr = String(now.getFullYear());

    // stats
    const pub = posts.filter(p => p.published).length, drafts = posts.length - pub, thisYear = wat.filter(w => (w.watched_on || '').startsWith(yr)).length;
    $('st-posts').textContent = c.posts ?? posts.length; $('st-posts-sub').textContent = pub + ' published' + (drafts ? ' · ' + drafts + ' draft' + (drafts > 1 ? 's' : '') : '');
    $('st-mem').textContent = c.memories ?? mems.length; $('st-mem-sub').textContent = mems[0] ? 'latest ' + ago(mems[0].created_at) : 'none yet';
    $('st-watch').textContent = c.watched ?? wat.length; $('st-watch-sub').textContent = thisYear + ' in ' + yr;
    $('st-react').textContent = c.reactions ?? 0;
    $('ovLine').innerHTML = `${c.posts ?? posts.length} posts, ${c.memories ?? mems.length} ${(c.memories ?? mems.length) === 1 ? 'memory' : 'memories'} and ${c.watched ?? wat.length} titles logged. Storage is <b>${pf < 1 ? pf.toFixed(2) : pf.toFixed(1)}%</b> full &mdash; ${pf < 50 ? 'plenty of room.' : pf < 80 ? 'keep an eye on it.' : 'time to clean up.'}`;

    // warning
    if (pf >= 80 || pd >= 80) { $('stWarn').innerHTML = '<b>Storage is ' + Math.round(Math.max(pf, pd)) + '% full.</b> Free space by deleting unused files or old memories in <a href="#" data-goto="files">Files</a>.'; show('stWarn', true); } else show('stWarn', false);

    // gauges
    $('gFiles').innerHTML = gauge(pf, 'Photos', fmtBytes(files.bytes) + ' of 1 GB · ' + (files.count || 0) + ' files', '#5B78F6', '#00cfff', 'gfg');
    $('gDb').innerHTML = gauge(pd, 'Database', fmtBytes(data.db_bytes) + ' of 500 MB', '#06d6a0', '#5B78F6', 'gdg');

    // folders stacked bar
    const FCOL = { memories: '#00cfff', covers: '#5B78F6', posts: '#c77dff' }, FL = { memories: 'Memories', covers: 'Covers', posts: 'Post images' };
    const fol = (files.by_folder || []).sort((a, b) => b.bytes - a.bytes), fsum = fol.reduce((a, f) => a + f.bytes, 0) || 1;
    $('ovStack').innerHTML = fol.map(f => `<i style="width:${f.bytes / fsum * 100}%;background:${FCOL[f.folder] || '#888'}" title="${esc(FL[f.folder] || f.folder)}: ${fmtBytes(f.bytes)}"></i>`).join('') || '<i style="width:100%;background:rgba(255,255,255,.06)"></i>';
    $('st-folders').innerHTML = fol.map(f => `<div><i style="background:${FCOL[f.folder] || '#888'}"></i><span>${esc(FL[f.folder] || f.folder)}</span><b>${f.count} · ${fmtBytes(f.bytes)}</b></div>`).join('') || '<p class="note">No photos yet.</p>';
    $('st-avg').textContent = files.count ? 'Average photo ' + fmtBytes(files.bytes / files.count) + ' · room for about ' + Math.floor((FILE_CAP - files.bytes) / (files.bytes / files.count)).toLocaleString() + ' more.' : '';

    // tables
    const exact = { posts: c.posts, memories: c.memories, watched: c.watched, reactions: c.reactions };
    const tabs = (data.tables || []).sort((a, b) => b.bytes - a.bytes), tmax = tabs[0] ? tabs[0].bytes : 1;
    $('st-tables').innerHTML = tabs.map(t => { const n = exact[t.name] != null ? exact[t.name] : (t.rows > 0 ? t.rows : null);
      return `<div class="ov-trow"><span class="ov-tname">${esc(t.name.replace('_', ' '))}</span><div class="ov-tbar"><i style="width:${Math.max(4, t.bytes / tmax * 100)}%"></i></div><span class="ov-tval">${n != null ? '<b>' + n + '</b> rows · ' : ''}${fmtBytes(t.bytes)}</span></div>`; }).join('');

    // largest files with thumbnails
    const lg = files.largest || [], lmax = lg[0] ? lg[0].bytes : 1;
    $('st-largest').innerHTML = lg.slice(0, 6).map(l => `<a class="ov-file" href="${esc(sb.storage.from('media').getPublicUrl(l.name).data.publicUrl)}" target="_blank" rel="noopener">
      <img loading="lazy" src="${esc(sb.storage.from('media').getPublicUrl(l.name).data.publicUrl)}" alt=""><div><span>${esc(FL[l.name.split('/')[0]] || l.name.split('/')[0])}</span><div class="ov-tbar"><i style="width:${l.bytes / lmax * 100}%"></i></div></div><b>${fmtBytes(l.bytes)}</b></a>`).join('') || '<p class="note">No files yet.</p>';

    // recent activity
    const ev = [
      ...posts.map(p => ({ t: p.created_at, icon: 'page-edit', col: '#5B78F6', html: (p.published ? 'Published ' : 'Drafted ') + '<b>' + esc(p.title) + '</b>', go: 'posts' })),
      ...mems.map(m => ({ t: m.created_at, icon: 'media-image', col: '#06d6a0', html: 'Added a memory' + (m.caption ? ' &mdash; <b>' + esc(m.caption) + '</b>' : ''), go: 'memories' })),
      ...wat.map(w => ({ t: w.created_at, icon: w.kind === 'series' ? 'tv' : 'movie', col: '#f5c518', html: 'Watched <b>' + esc(w.title) + '</b>' + (w.my_rating ? ' <span class="ov-star">★ ' + w.my_rating + '</span>' : ''), go: 'watched' }))
    ].filter(e => e.t).sort((a, b) => b.t.localeCompare(a.t)).slice(0, 8);
    $('ovActivity').innerHTML = ev.length ? ev.map(e => `<button type="button" class="ov-ev" data-goto="${e.go}"><span class="ov-ev-ic" style="--c:${e.col}"><i class="iconoir-${e.icon}"></i></span><span class="ov-ev-txt">${e.html}</span><small>${ago(e.t)}</small></button>`).join('') : '<p class="note">Nothing yet &mdash; write your first post!</p>';
  }

  /* ---------- posts ---------- */
  let editingId = null, coverUrl = null, origCover = null, pendingCover = null;
  const pathOf = url => (url && url.includes('/object/public/media/')) ? decodeURIComponent(url.split('/object/public/media/')[1].split('?')[0]) : null;
  const dropFile = path => { if (path) sb.storage.from('media').remove([path]).catch(() => {}); };
  const showCover = url => { if (url) { $('coverPrev').src = url; show('coverPrev', true); show('coverRemove', true); } else { $('coverPrev').removeAttribute('src'); show('coverPrev', false); show('coverRemove', false); } };
  const updPreview = () => { $('preview').innerHTML = renderBody($('body').value) || '<p class="note">Preview appears here…</p>'; };
  $('body').addEventListener('input', updPreview); $('postDate').value = today();
  $('coverFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; $('coverInfo').textContent = 'Compressing & uploading…';
    try { const r = await uploadImage(f, 'covers', 560, 0.4); dropFile(pendingCover); pendingCover = r.path; coverUrl = r.url; showCover(r.url); $('coverInfo').textContent = Math.round(r.bytes / 1024) + ' KB'; }
    catch (err) { $('coverInfo').textContent = 'Upload failed: ' + err.message; }
  });
  $('coverRemove').addEventListener('click', () => {
    dropFile(pendingCover); pendingCover = null; coverUrl = null; $('coverFile').value = ''; showCover(null);
    $('coverInfo').textContent = editingId && origCover ? 'Cover removed - click Save post to apply.' : 'Cover removed.';
  });
  $('insertImg').addEventListener('click', () => $('inlineFile').click());
  $('inlineFile').addEventListener('change', async e => {
    const files = Array.from(e.target.files); e.target.value = ''; if (!files.length) return; $('postMsg').textContent = 'Uploading image(s)…';
    try {
      let md = ''; for (const f of files) { const r = await uploadImage(f, 'posts', 640, 0.4); md += '\n\n![](' + r.url + ')'; }
      const ta = $('body'), pos = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + md + '\n\n' + ta.value.slice(pos); updPreview(); $('postMsg').textContent = 'Image inserted. Put text in the [ ] to add a caption.';
    } catch (err) { $('postMsg').textContent = 'Upload failed: ' + err.message; }
  });
  function resetForm() {
    editingId = null; coverUrl = null; origCover = null; pendingCover = null; ['title', 'excerpt', 'body'].forEach(i => $(i).value = ''); $('published').checked = false; $('coverFile').value = ''; $('postDate').value = today();
    showCover(null); $('coverInfo').textContent = ''; $('formTitle').textContent = 'New post'; show('cancelEdit', false); updPreview();
  }
  $('cancelEdit').addEventListener('click', () => { dropFile(pendingCover); pendingCover = null; resetForm(); });
  $('savePost').addEventListener('click', async () => {
    const title = $('title').value.trim(); if (!title) { $('postMsg').textContent = 'Add a title first.'; return; }
    const row = { title, excerpt: $('excerpt').value.trim() || null, body: $('body').value, cover_url: coverUrl, published: $('published').checked, updated_at: new Date().toISOString(), created_at: fromDateInput($('postDate').value || today()) };
    $('savePost').disabled = true;
    const { error } = await (editingId ? sb.from('posts').update(row).eq('id', editingId) : sb.from('posts').insert(row)); $('savePost').disabled = false;
    if (error) { $('postMsg').textContent = 'Save failed: ' + error.message; return; }
    if (origCover && origCover !== coverUrl) dropFile(pathOf(origCover));
    pendingCover = null; $('postMsg').textContent = 'Saved ✔'; resetForm(); loadPosts(); loadOverview();
  });
  async function loadPosts() {
    const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending: false });
    if (error) { $('postList').textContent = error.message; return; } window._posts = data;
    $('postList').innerHTML = data.length ? data.map(p => `<div class="list-item">${coverOf(p) ? `<img src="${esc(coverOf(p))}" alt="">` : '<span class="thumb-ph" title="No cover image">no cover</span>'}
      <div class="t">${esc(p.title)}<small>${fmtDate(p.created_at)} · ${p.published ? '<span class="ok">Published</span>' : 'Draft'}</small></div>
      <button class="adm-ghost" data-a="edit" data-id="${p.id}"><i class="iconoir-edit-pencil"></i> Edit</button>
      <button class="adm-ghost" data-a="toggle" data-id="${p.id}">${p.published ? 'Unpublish' : 'Publish'}</button>
      <button class="adm-ghost danger" data-a="del" data-id="${p.id}"><i class="iconoir-trash"></i></button></div>`).join('') : '<p class="note">No posts yet.</p>';
  }
  $('postList').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const p = (window._posts || []).find(x => x.id === b.dataset.id); if (!p) return;
    if (b.dataset.a === 'edit') {
      editingId = p.id; coverUrl = p.cover_url; $('title').value = p.title; $('excerpt').value = p.excerpt || ''; $('body').value = p.body; $('published').checked = p.published; $('postDate').value = toDateInput(p.created_at);
      dropFile(pendingCover); pendingCover = null; origCover = p.cover_url; showCover(p.cover_url); $('coverFile').value = ''; $('coverInfo').textContent = '';
      $('formTitle').textContent = 'Editing post'; show('cancelEdit', true); updPreview(); scrollTo({ top: 0, behavior: 'smooth' });
    } else if (b.dataset.a === 'toggle') { await sb.from('posts').update({ published: !p.published }).eq('id', p.id); loadPosts(); }
    else if (b.dataset.a === 'del' && confirm('Delete "' + p.title + '" permanently?')) { const { error } = await sb.from('posts').delete().eq('id', p.id); if (!error) dropFile(pathOf(p.cover_url)); loadPosts(); loadOverview(); }
  });

  /* ---------- memories ---------- */
  $('memUpload').addEventListener('click', async () => {
    const files = Array.from($('memFiles').files); if (!files.length) { $('memMsg').textContent = 'Pick some pictures first.'; return; }
    $('memUpload').disabled = true; let done = 0, kb = 0;
    for (const f of files) {
      $('memMsg').textContent = 'Uploading ' + (done + 1) + ' of ' + files.length + '…';
      try { const r = await uploadImage(f, 'memories', 640, 0.4); kb += r.bytes / 1024;
        const { error } = await sb.from('memories').insert({ caption: $('memCap').value.trim() || null, image_url: r.url, image_path: r.path, taken_on: $('memDate').value || null }); if (error) throw error; done++;
      } catch (err) { $('memMsg').textContent = 'Failed on ' + f.name + ': ' + err.message; break; }
    }
    $('memUpload').disabled = false;
    if (done === files.length) { $('memMsg').textContent = 'Uploaded ' + done + ' (' + Math.round(kb) + ' KB total) ✔'; $('memFiles').value = ''; $('memCap').value = ''; }
    loadMemories(); loadOverview();
  });
  async function loadMemories() {
    const { data, error } = await sb.from('memories').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) { $('memList').textContent = error.message; return; } window._mems = data;
    $('memList').innerHTML = data.length ? data.map(m => `<figure class="mem-tile"><img src="${esc(m.image_url)}" alt="" loading="lazy"><figcaption>${esc(m.caption || '')}<small>${m.taken_on ? fmtDate(m.taken_on + 'T12:00:00') : fmtDate(m.created_at)}</small></figcaption><button class="tile-del" data-id="${m.id}" title="Delete"><i class="iconoir-trash"></i></button></figure>`).join('') : '<p class="note">No memories yet.</p>';
  }
  $('memList').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const m = (window._mems || []).find(x => x.id === b.dataset.id); if (!m || !confirm('Delete this picture?')) return;
    await sb.storage.from('media').remove([m.image_path]); await sb.from('memories').delete().eq('id', m.id); loadMemories(); loadOverview();
  });

  /* ---------- OMDb key: stored in admin_settings (account-wide), cached in this browser ---------- */
  const KEY = 'shovo_omdb_key'; let omdbKeyVal = (() => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } })();
  const omdbKey = () => omdbKeyVal;
  const cacheKey = v => { omdbKeyVal = v || ''; try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} };
  function paintKey(msg) {
    $('omdbKey').value = omdbKeyVal; show('omdbWarn', !omdbKeyVal); show('removeKey', !!omdbKeyVal);
    if (msg != null) $('keyMsg').textContent = msg;
  }
  async function loadKey() {
    paintKey();
    const { data, error } = await sb.from('admin_settings').select('value').eq('key', 'omdb_key').maybeSingle();
    if (error) { paintKey('Key is only saved in this browser - run supabase/05_fix_watched_access_and_settings.sql to save it to your account.'); return; }
    if (data && data.value) { cacheKey(data.value); paintKey(); }
    else if (omdbKeyVal) { await sb.from('admin_settings').upsert({ key: 'omdb_key', value: omdbKeyVal, updated_at: new Date().toISOString() }); }   // move an old browser-only key to the account
  }
  $('saveKey').addEventListener('click', async () => {
    const v = $('omdbKey').value.trim(); if (!v) { paintKey('Paste your key first.'); return; }
    cacheKey(v);
    const { error } = await sb.from('admin_settings').upsert({ key: 'omdb_key', value: v, updated_at: new Date().toISOString() });
    paintKey(error ? 'Saved in this browser only (' + error.message + ')' : 'Saved to your account ✔ - works on every device you log in from.');
  });
  $('removeKey').addEventListener('click', async () => {
    if (!confirm('Remove the OMDb key from your account?')) return;
    cacheKey(''); await sb.from('admin_settings').delete().eq('key', 'omdb_key'); paintKey('Key removed.');
  });

  /* ---------- watched ---------- */
  let pick = null, watched = [], selYear = null;
  // ---- request budget (1,000/day on the free key): count locally, one call per look-up ----
  const RQ = 'shovo_omdb_req';
  function reqInfo() { const t = today(); let o = {}; try { o = JSON.parse(localStorage.getItem(RQ) || '{}'); } catch (e) {} if (o.d !== t) o = { d: t, n: 0 }; return o; }
  function bumpReq() { const o = reqInfo(); o.n++; localStorage.setItem(RQ, JSON.stringify(o)); showReq(); }
  function showReq() { const o = reqInfo(); $('reqCount').textContent = 'Used today: ' + o.n + ' / 1000.'; }
  showReq();

  async function omdb(params) {
    const u = new URL('https://www.omdbapi.com/'); u.searchParams.set('apikey', omdbKey()); Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
    bumpReq();
    const r = await fetch(u); const j = await r.json(); if (j.Response === 'False') throw new Error(j.Error || 'Not found'); return j;
  }
  // ONE request: direct title look-up returns the full record (no separate search + details calls)
  async function search() {
    if (!omdbKey()) { show('omdbWarn', true); return; }
    const q = $('wSearch').value.trim(); if (!q) return;
    const already = watched.find(w => w.title.toLowerCase() === q.toLowerCase());
    if (already && !confirm('"' + already.title + '" is already in your list. Look it up anyway?')) return;
    $('wResults').innerHTML = '<p class="note">Looking up…</p>'; show('wPick', false);
    try {
      const d = await omdb({ t: q, y: $('wYear').value.trim(), type: $('wType').value });
      pick = { imdb_id: d.imdbID, title: d.Title, year: parseInt(d.Year) || null, kind: d.Type === 'series' ? 'series' : 'movie',
        genres: (d.Genre || '').split(',').map(s => s.trim()).filter(g => g && g !== 'N/A'), runtime_min: parseInt(d.Runtime) || null,
        imdb_rating: parseFloat(d.imdbRating) || null, poster_url: d.Poster && d.Poster !== 'N/A' ? d.Poster : null };
      $('wpPoster').src = pick.poster_url || ''; $('wpPoster').style.visibility = pick.poster_url ? 'visible' : 'hidden';
      $('wpTitle').textContent = pick.title + (pick.year ? ' (' + pick.year + ')' : ''); $('wpImdb').href = 'https://www.imdb.com/title/' + pick.imdb_id + '/';
      $('wpMeta').textContent = [pick.kind === 'series' ? 'Series' : 'Movie', pick.genres.join(', '), pick.runtime_min ? pick.runtime_min + ' min' : '', pick.imdb_rating ? 'IMDb ' + pick.imdb_rating : '', d.Plot && d.Plot !== 'N/A' ? '— ' + d.Plot : ''].filter(Boolean).join(' · ');
      $('wpDate').value = today(); $('wpRating').value = ''; $('wpComment').value = ''; drawStars(0);
      $('wResults').innerHTML = ''; show('wPick', true); $('wPick').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) { $('wResults').innerHTML = '<p class="err">' + esc(err.message === 'Movie not found!' ? 'Not found - check the spelling, or add the year.' : err.message) + '</p>'; }
  }
  $('wGo').addEventListener('click', search);
  [$('wSearch'), $('wYear')].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') search(); }));
  function drawStars(v) { $('wpStars').innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" class="star${i < v ? ' on' : ''}" data-v="${i + 1}" aria-label="${i + 1}">★</button>`).join('') + `<span class="note">${v ? v + '/10' : '—'}</span>`; }
  $('wpStars').addEventListener('click', e => { const b = e.target.closest('.star'); if (!b) return; const v = +b.dataset.v === +$('wpRating').value ? 0 : +b.dataset.v; $('wpRating').value = v || ''; drawStars(v); });
  $('wCancel').addEventListener('click', () => { show('wPick', false); pick = null; });
  $('wSave').addEventListener('click', async () => {
    if (!pick) return; $('wSave').disabled = true;
    const row = Object.assign({}, pick, { watched_on: $('wpDate').value || today(), my_rating: +$('wpRating').value || null, comment: $('wpComment').value.trim() || null });
    const { error } = await sb.from('watched').upsert(row, { onConflict: 'imdb_id' }); $('wSave').disabled = false;
    if (error) { $('wMsg').textContent = 'Save failed: ' + error.message; return; }
    $('wMsg').textContent = 'Added ✔'; show('wPick', false); pick = null; $('wSearch').value = ''; $('wYear').value = ''; loadWatched(); loadOverview();
  });
  async function loadWatched() {
    const { data, error } = await sb.from('watched').select('*').order('watched_on', { ascending: false });
    if (error) { $('wList').innerHTML = '<p class="note">Watched table not ready - run supabase/02_watched_and_storage.sql.</p>'; return; }
    watched = data; const years = [...new Set(watched.map(w => w.watched_on.slice(0, 4)))].sort().reverse();
    if (!selYear || !years.includes(selYear)) selYear = years[0] || String(new Date().getFullYear());
    $('yearChips').innerHTML = years.map(y => `<button class="chip${y === selYear ? ' on' : ''}" data-y="${y}">${y}</button>`).join('') || '<span class="note">Nothing yet</span>';
    renderStats(); renderList();
  }
  $('yearChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { selYear = b.dataset.y; loadWatched(); } });
  function renderStats() {
    const ys = watched.filter(w => w.watched_on.startsWith(selYear));
    const movies = ys.filter(w => w.kind === 'movie'), series = ys.filter(w => w.kind === 'series');
    $('ys-movies').textContent = movies.length; $('ys-series').textContent = series.length;
    $('ys-chRating').innerHTML = ratingDonut(ys, { size: 130, stroke: 16 }); $('ys-chKind').innerHTML = kindDonut(ys, { size: 130, stroke: 16 });
    const mins = ys.reduce((a, w) => a + (w.runtime_min || 0) * (w.kind === 'series' ? 8 : 1), 0); $('ys-hours').textContent = Math.round(mins / 60) + 'h';
    const rated = ys.filter(w => w.my_rating); $('ys-avg').textContent = rated.length ? (rated.reduce((a, w) => a + w.my_rating, 0) / rated.length).toFixed(1) : '–';
    const g = {}; ys.forEach(w => (w.genres || []).forEach(x => g[x] = (g[x] || 0) + 1));
    const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 7), max = top[0] ? top[0][1] : 1;
    $('ys-genres').innerHTML = top.map(([k, v], i) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar"><i style="width:${v / max * 100}%;--i:${i}"></i></div><b>${v}</b></div>`).join('') || '<p class="note">Add something to see your genre mix.</p>';
    const fav = rated.slice().sort((a, b) => b.my_rating - a.my_rating)[0], best = ys.filter(w => w.imdb_rating).sort((a, b) => b.imdb_rating - a.imdb_rating)[0];
    const months = {}; ys.forEach(w => { const m = w.watched_on.slice(0, 7); months[m] = (months[m] || 0) + 1; }); const busy = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    $('ys-high').innerHTML = [top[0] && `<div><span>Favourite genre</span><b>${esc(top[0][0])}</b></div>`, fav && `<div><span>Your top pick</span><b>${esc(fav.title)} · ${fav.my_rating}/10</b></div>`, best && `<div><span>Highest IMDb</span><b>${esc(best.title)} · ${best.imdb_rating}</b></div>`, busy && `<div><span>Busiest month</span><b>${new Date(busy[0] + '-15').toLocaleString(undefined, { month: 'long' })} · ${busy[1]}</b></div>`, `<div><span>Total this year</span><b>${ys.length}</b></div>`].filter(Boolean).join('');
  }
  function renderList() {
    const q = $('wFilter').value.trim().toLowerCase();
    const rows = watched.filter(w => w.watched_on.startsWith(selYear) && (!q || (w.title + ' ' + (w.genres || []).join(' ') + ' ' + (w.comment || '')).toLowerCase().includes(q)));
    $('wList').innerHTML = rows.length ? rows.map(w => `<article class="w-item">
      <a href="https://www.imdb.com/title/${esc(w.imdb_id)}/" target="_blank" rel="noopener" class="w-poster">${w.poster_url ? `<img src="${esc(w.poster_url)}" alt="" loading="lazy">` : '<span class="w-nop"><i class="iconoir-movie"></i></span>'}</a>
      <div class="w-body">
        <div class="w-title"><a href="https://www.imdb.com/title/${esc(w.imdb_id)}/" target="_blank" rel="noopener">${esc(w.title)}</a><span class="kind">${w.kind}</span>${w.year ? `<span class="note">${w.year}</span>` : ''}</div>
        <div class="w-meta">${(w.genres || []).map(g => `<span class="tag">${esc(g)}</span>`).join('')}${w.imdb_rating ? `<span class="tag imdb">IMDb ${w.imdb_rating}</span>` : ''}</div>
        ${w.comment ? `<p class="w-comment">${esc(w.comment)}</p>` : ''}
        <small class="note">Watched ${fmtDate(w.watched_on + 'T12:00:00')}</small>
      </div>
      <div class="w-side">${w.my_rating ? `<div class="w-rating">★ ${w.my_rating}<small>/10</small></div>` : '<div class="w-rating dim">unrated</div>'}<button class="adm-ghost danger" data-del="${w.id}" title="Remove"><i class="iconoir-trash"></i></button></div>
    </article>`).join('') : '<p class="note">Nothing here yet.</p>';
  }
  $('wFilter').addEventListener('input', renderList);
  $('wList').addEventListener('click', async e => { const b = e.target.closest('[data-del]'); if (!b || !confirm('Remove from your watched list?')) return; await sb.from('watched').delete().eq('id', b.dataset.del); loadWatched(); loadOverview(); });

  /* ---------- files manager ---------- */
  const FOLDERS = ['memories', 'covers', 'posts'], FLABEL = { memories: 'Memories', covers: 'Covers', posts: 'Post images' };
  let files = [], fView = 'all'; const sel = new Set();
  async function loadFiles() {
    $('fList').innerHTML = '<p class="note">Loading files…</p>';
    const lists = await Promise.all(FOLDERS.map(f => sb.storage.from('media').list(f, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })));
    const bad = lists.find(l => l.error);
    if (bad) { $('fList').innerHTML = '<p class="err">Could not list files: ' + esc(bad.error.message) + '</p>'; return; }
    const [pr, mr] = await Promise.all([sb.from('posts').select('id,title,cover_url,body'), sb.from('memories').select('id,caption,image_path')]);
    const use = {}, add = (k, v) => { if (k) (use[k] = use[k] || []).push(v); };
    (pr.data || []).forEach(p => { add(pathOf(p.cover_url), { kind: 'cover', post: p }); (p.body || '').replace(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g, (_, u) => add(pathOf(u), { kind: 'inline', post: p })); });
    (mr.data || []).forEach(m => add(m.image_path, { kind: 'memory', mem: m }));
    files = [];
    lists.forEach((l, i) => (l.data || []).filter(o => o.id && o.name !== '.emptyFolderPlaceholder').forEach(o => {
      const path = FOLDERS[i] + '/' + o.name;
      files.push({ path, folder: FOLDERS[i], name: o.name, size: (o.metadata && o.metadata.size) || 0, created: o.created_at || '', url: sb.storage.from('media').getPublicUrl(path).data.publicUrl, uses: use[path] || [] });
    }));
    files.sort((a, b) => b.created.localeCompare(a.created));
    if (!files.length) {   // storage says there are files, but we can't list them -> listing permission missing
      const { data: rep } = await sb.rpc('admin_storage_report');
      if (rep && rep.files && rep.files.count > 0) { $('fSummary').innerHTML = ''; $('fFolders').innerHTML = ''; $('fList').innerHTML = '<div class="warn" style="margin:12px">Storage has ' + rep.files.count + ' files, but this account can\'t list them yet. Run <b>supabase/06_admin_file_manager.sql</b> in the Supabase SQL Editor, then reload.</div>'; return; }
    }
    [...sel].forEach(p => { if (!files.some(f => f.path === p)) sel.delete(p); });
    renderFiles();
  }
  function usage(f) {
    if (!f.uses.length) return '<span class="f-badge unused">Unused</span>';
    return f.uses.map(u => u.kind === 'memory' ? `<span class="f-badge mem">Memory${u.mem.caption ? ': ' + esc(u.mem.caption) : ''}</span>`
      : `<span class="f-badge post">${u.kind === 'cover' ? 'Cover of' : 'In post'} “${esc(u.post.title)}”</span>`).join('');
  }
  function renderFiles() {
    const unused = files.filter(f => !f.uses.length), tot = a => fmtBytes(a.reduce((s, f) => s + f.size, 0));
    const views = [['all', 'All', files], ...FOLDERS.map(k => [k, FLABEL[k], files.filter(f => f.folder === k)]), ['unused', 'Unused', unused]];
    $('fFolders').innerHTML = views.map(([k, l, a]) => `<button class="chip${fView === k ? ' on' : ''}" data-f="${k}">${l} · ${a.length}</button>`).join('');
    $('fSummary').innerHTML = `${files.length} files · ${tot(files)} total · <b>${unused.length} unused (${tot(unused)})</b> can be deleted safely.`;
    const rows = fView === 'all' ? files : fView === 'unused' ? unused : files.filter(f => f.folder === fView);
    $('fList').innerHTML = rows.length ? rows.map(f => `<div class="f-row${sel.has(f.path) ? ' sel' : ''}" data-p="${esc(f.path)}">
      <label class="f-chk"><input type="checkbox" ${sel.has(f.path) ? 'checked' : ''}></label>
      <a class="f-thumb" href="${esc(f.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(f.url)}" alt=""></a>
      <div class="f-info"><b title="${esc(f.path)}">${esc(f.name)}</b><small>${FLABEL[f.folder]} · ${f.created ? fmtDate(f.created) : ''}</small><div>${usage(f)}</div></div>
      <span class="f-size">${fmtBytes(f.size)}</span>
      <button class="adm-ghost danger" data-del title="Delete this file"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>`).join('') : '<p class="note">No files here.</p>';
    $('fDelete').disabled = !sel.size; $('fDelete').innerHTML = '<i class="iconoir-trash"></i> Delete selected' + (sel.size ? ' (' + sel.size + ')' : '');
  }
  async function deleteFiles(list) {
    if (!list.length) return;
    const used = list.filter(f => f.uses.length), size = fmtBytes(list.reduce((s, f) => s + f.size, 0));
    let msg = 'Delete ' + list.length + ' file' + (list.length > 1 ? 's' : '') + ' (' + size + ')? This cannot be undone.';
    if (used.length) msg += '\n\n' + used.length + ' of them are in use:\n• memories using them will be deleted\n• post covers will be removed\n• images inside posts will stop showing';
    if (!confirm(msg)) return;
    $('fMsg').textContent = 'Deleting…';
    const { error } = await sb.storage.from('media').remove(list.map(f => f.path));
    if (error) { $('fMsg').textContent = 'Delete failed: ' + error.message; return; }
    for (const f of used) for (const u of f.uses) {
      if (u.kind === 'memory') await sb.from('memories').delete().eq('id', u.mem.id);
      else if (u.kind === 'cover') await sb.from('posts').update({ cover_url: null }).eq('id', u.post.id);
    }
    list.forEach(f => sel.delete(f.path));
    $('fMsg').textContent = 'Deleted ' + list.length + ' · freed ' + size + ' ✔';
    loadFiles(); loadOverview(); loadMemories(); loadPosts();
  }
  $('fFolders').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { fView = b.dataset.f; renderFiles(); } });
  $('fList').addEventListener('click', e => {
    const row = e.target.closest('.f-row'); if (!row) return; const f = files.find(x => x.path === row.dataset.p); if (!f) return;
    if (e.target.closest('[data-del]')) { deleteFiles([f]); return; }
    if (e.target.closest('.f-chk')) { sel.has(f.path) ? sel.delete(f.path) : sel.add(f.path); renderFiles(); }
  });
  $('fSelUnused').addEventListener('click', () => { files.filter(f => !f.uses.length).forEach(f => sel.add(f.path)); renderFiles(); });
  $('fSelNone').addEventListener('click', () => { sel.clear(); renderFiles(); });
  $('fDelete').addEventListener('click', () => deleteFiles(files.filter(f => sel.has(f.path))));

  route(); updPreview();
})();
