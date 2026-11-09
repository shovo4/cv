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
    show('app', true); loadOverview(); loadPosts(); loadMemories(); loadWatched(); loadKey();
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
    if (error) { $('loginMsg').textContent = 'Wrong email or password.'; return; }
    $('pw').value = ''; route();
  });
  ['logout', 'logout2'].forEach(id => $(id).addEventListener('click', async e => { e.preventDefault(); try { localStorage.removeItem('shovo_omdb_key'); localStorage.removeItem('shovo_omdb_req'); } catch (err) {} await sb.auth.signOut(); location.reload(); }));
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') route(); });

  const titles = { overview: 'Overview', posts: 'Blog posts', memories: 'Memories', watched: 'Watched', settings: 'Settings' };
  function goto(v) {
    document.querySelectorAll('.adm-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    document.querySelectorAll('.adm-view').forEach(s => s.classList.toggle('hide', s.id !== 'view-' + v));
    $('viewTitle').textContent = titles[v] || v; location.hash = v; window.scrollTo(0, 0);
  }
  document.querySelectorAll('.adm-nav button').forEach(b => b.addEventListener('click', () => goto(b.dataset.view)));
  document.addEventListener('click', e => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); goto(a.dataset.goto); } });
  if (titles[location.hash.slice(1)]) goto(location.hash.slice(1));

  /* ---------- overview / storage ---------- */
  async function loadOverview() {
    const { data, error } = await sb.rpc('admin_storage_report');
    if (error) { $('st-err').textContent = 'Storage report unavailable - run supabase/02_watched_and_storage.sql (' + error.message + ')'; return; }
    const c = data.counts || {}; $('st-posts').textContent = c.posts ?? 0; $('st-mem').textContent = c.memories ?? 0; $('st-watch').textContent = c.watched ?? 0; $('st-react').textContent = c.reactions ?? 0;
    const files = data.files || { bytes: 0, count: 0 }, FILE_CAP = 1073741824, DB_CAP = 524288000;
    $('m-files').textContent = fmtBytes(files.bytes) + ' / 1 GB · ' + (files.count || 0) + ' files';
    $('b-files').style.width = Math.min(100, files.bytes / FILE_CAP * 100).toFixed(2) + '%';
    $('m-db').textContent = fmtBytes(data.db_bytes) + ' / 500 MB';
    $('b-db').style.width = Math.min(100, data.db_bytes / DB_CAP * 100).toFixed(2) + '%';
    $('st-folders').innerHTML = (files.by_folder || []).map(f => `<div><span>${esc(f.folder)}</span><b>${f.count} · ${fmtBytes(f.bytes)}</b></div>`).join('') || '<div><span>No files yet</span><b>–</b></div>';
    if (files.count) $('st-avg').textContent = 'Average file size ' + fmtBytes(files.bytes / files.count) + ' · at this rate 1 GB ≈ ' + Math.floor(FILE_CAP / (files.bytes / files.count)).toLocaleString() + ' photos.';
    $('st-tables').innerHTML = (data.tables || []).sort((a, b) => b.bytes - a.bytes).map(t => `<div><span>${esc(t.name)}</span><b>${Math.max(0, t.rows)} rows · ${fmtBytes(t.bytes)}</b></div>`).join('');
    $('st-largest').innerHTML = (files.largest || []).map(l => `<div><span title="${esc(l.name)}">${esc(l.name.split('/').pop())}</span><b>${fmtBytes(l.bytes)}</b></div>`).join('') || '<div><span>–</span><b></b></div>';
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

  route(); updPreview();
})();
