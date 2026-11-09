/* Shared helpers for blogs / memories / admin pages */
(function () {
  const cfg = window.SITE_CONFIG;
  if (!window.supabase || !cfg) { console.warn('Supabase library not loaded'); return; }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  /* ---------- small utils ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
    catch (e) { return ""; }
  }

  /* Tiny safe renderer: # / ## headings, > quote, - lists, ![alt](https://img), **b**, *i*, [t](https://u), `code` */
  function inline(t) {
    return t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function renderBody(src) {
    const blocks = esc(src || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
    return blocks.map(b => {
      b = b.trim();
      if (!b) return "";
      let m;
      if ((m = b.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/)))
        return '<figure><img loading="lazy" src="' + m[2] + '" alt="' + m[1] + '">' + (m[1] ? "<figcaption>" + m[1] + "</figcaption>" : "") + "</figure>";
      if (b.startsWith("## ")) return "<h3>" + inline(b.slice(3)) + "</h3>";
      if (b.startsWith("# ")) return "<h2>" + inline(b.slice(2)) + "</h2>";
      if (b.startsWith("&gt; ")) return "<blockquote>" + inline(b.replace(/^&gt; ?/gm, "").replace(/\n/g, "<br>")) + "</blockquote>";
      if (/^- /.test(b)) return "<ul>" + b.split("\n").map(l => "<li>" + inline(l.replace(/^- /, "")) + "</li>").join("") + "</ul>";
      return "<p>" + inline(b).replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
  }

  /* ---------- device id (one reaction per device per item) ---------- */
  let memoryId = null;
  function deviceId() {
    try {
      let id = localStorage.getItem("shovo_device_id");
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)));
        localStorage.setItem("shovo_device_id", id);
      }
      return id;
    } catch (e) {
      memoryId = memoryId || (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      return memoryId;
    }
  }

  /* ---------- reactions ---------- */
  const REACTIONS = [
    { k: "fire", e: "🔥", l: "Fire" }, { k: "love", e: "❤️", l: "Love" }, { k: "wow", e: "😮", l: "Wow" }
  ];

  async function mountReactions(type, containers) {
    const els = Array.from(containers);
    if (!els.length) return;
    const ids = els.map(e => e.dataset.id);
    const dev = deviceId();
    const state = {};
    ids.forEach(id => state[id] = { counts: {}, mine: null });

    const [c, m] = await Promise.all([
      sb.rpc("get_reaction_counts", { p_type: type, p_ids: ids }),
      sb.rpc("get_my_reactions", { p_type: type, p_ids: ids, p_device: dev })
    ]);
    (c.data || []).forEach(r => { state[r.target_id].counts[r.reaction] = Number(r.total); });
    (m.data || []).forEach(r => { state[r.target_id].mine = r.reaction; });

    els.forEach(el => {
      const id = el.dataset.id;
      el.classList.add("reactions");
      const draw = () => {
        const st = state[id];
        el.innerHTML = REACTIONS.map(r =>
          '<button type="button" class="rx' + (st.mine === r.k ? " on" : "") + '" data-k="' + r.k + '" title="' + r.l + '" aria-pressed="' + (st.mine === r.k) + '">' +
          '<span class="rx-e">' + r.e + '</span><span class="rx-n">' + (st.counts[r.k] || 0) + "</span></button>").join("") +
          '<span class="rx-msg" aria-live="polite"></span>';
      };
      draw();
      el.addEventListener("click", async ev => {
        const btn = ev.target.closest(".rx");
        if (!btn) return;
        const key = btn.dataset.k, st = state[id], prev = st.mine, next = prev === key ? null : key;
        if (prev) st.counts[prev] = Math.max(0, (st.counts[prev] || 0) - 1);
        if (next) st.counts[next] = (st.counts[next] || 0) + 1;
        st.mine = next; draw();
        const { error } = await sb.rpc("set_reaction", { p_type: type, p_id: id, p_device: dev, p_reaction: next || "" });
        if (error) {
          if (next) st.counts[next] = Math.max(0, (st.counts[next] || 0) - 1);
          if (prev) st.counts[prev] = (st.counts[prev] || 0) + 1;
          st.mine = prev; draw();
          const msg = el.querySelector(".rx-msg");
          if (msg) { msg.textContent = "Couldn't save, try again later."; setTimeout(() => { msg.textContent = ""; }, 3000); }
        }
      });
    });
  }

  async function totalReactions(type, ids) {
    const out = {};
    if (!ids.length) return out;
    const { data } = await sb.rpc("get_reaction_counts", { p_type: type, p_ids: ids });
    (data || []).forEach(r => { out[r.target_id] = (out[r.target_id] || 0) + Number(r.total); });
    return out;
  }

  /* ---------- image compression (saved in low quality on purpose) ---------- */
  async function loadBitmap(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      return await new Promise((res, rej) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => { res(img); URL.revokeObjectURL(url); };
        img.onerror = rej; img.src = url;
      });
    }
  }
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 640; quality = quality || 0.4;
    const bmp = await loadBitmap(file);
    const w0 = bmp.width, h0 = bmp.height, s = Math.min(1, maxDim / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise(r => c.toBlob(r, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/jpeg", quality));
    return blob;
  }
  async function uploadImage(file, folder, maxDim, quality) {
    const blob = await compressImage(file, maxDim, quality);
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;
    const url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    return { path, url, bytes: blob.size };
  }

  /* ---------- donut chart (SVG) ---------- */
  function donut(items, opts) {
    opts = opts || {}; const size = opts.size || 150, sw = opts.stroke || 18, r = (size - sw) / 2, C = 2 * Math.PI * r;
    const total = items.reduce((a, i) => a + i.value, 0) || 1; let off = 0;
    const segs = items.filter(i => i.value > 0).map((i, k) => {
      const len = i.value / total * C, s = `<circle class="dn-seg" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${i.color}" stroke-width="${sw}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" style="--i:${k}"><title>${esc(i.label)}: ${i.value}</title></circle>`;
      off += len; return s;
    }).join('');
    const legend = items.map(i => `<li${i.value ? '' : ' class="dim"'}><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${i.value}</b><small>${Math.round(i.value / total * 100)}%</small></li>`).join('');
    return `<div class="dn"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${sw}"/>${segs}</svg>` +
      `<div class="dn-center"><b>${opts.center != null ? opts.center : total}</b><small>${esc(opts.centerLabel || '')}</small></div><ul class="dn-legend">${legend}</ul></div>`;
  }
  const RATING_BUCKETS = [
    { label: 'Loved · 9–10', test: r => r >= 9, color: '#f5c518' },
    { label: 'Great · 7–8', test: r => r >= 7 && r < 9, color: '#5B78F6' },
    { label: 'Okay · 5–6', test: r => r >= 5 && r < 7, color: '#00cfff' },
    { label: 'Meh · 1–4', test: r => r >= 1 && r < 5, color: '#ef476f' },
    { label: 'Unrated', test: r => !r, color: '#3a3a44' }
  ];
  function ratingDonut(rows, opts) { return donut(RATING_BUCKETS.map(b => ({ label: b.label, color: b.color, value: rows.filter(w => b.test(w.my_rating || 0)).length })), Object.assign({ centerLabel: 'titles' }, opts)); }
  function kindDonut(rows, opts) { return donut([{ label: 'Movies', color: '#5B78F6', value: rows.filter(w => w.kind === 'movie').length }, { label: 'Series', color: '#00cfff', value: rows.filter(w => w.kind === 'series').length }], Object.assign({ centerLabel: 'watched' }, opts)); }
  function genreDonut(rows, opts) {
    const g = {}; rows.forEach(w => (w.genres || []).forEach(x => g[x] = (g[x] || 0) + 1));
    const top = Object.entries(g).sort((a, b) => b[1] - a[1]); const cols = ['#5B78F6', '#00cfff', '#f5c518', '#ef476f', '#06d6a0', '#c77dff'];
    const items = top.slice(0, 5).map(([k, v], i) => ({ label: k, value: v, color: cols[i] })); const rest = top.slice(5).reduce((a, [, v]) => a + v, 0); if (rest) items.push({ label: 'Other', value: rest, color: '#3a3a44' });
    return donut(items, Object.assign({ centerLabel: 'genre tags' }, opts));
  }

  window.Blog = { sb, esc, fmtDate, renderBody, mountReactions, totalReactions, uploadImage, REACTIONS, donut, ratingDonut, kindDonut, genreDonut };
})();
