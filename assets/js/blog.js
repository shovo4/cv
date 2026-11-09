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
    { k: "like", e: "👍", l: "Like" }, { k: "love", e: "❤️", l: "Love" },
    { k: "haha", e: "😂", l: "Haha" }, { k: "wow", e: "😮", l: "Wow" }, { k: "sad", e: "😢", l: "Sad" }
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
    maxDim = maxDim || 1200; quality = quality || 0.6;
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

  window.Blog = { sb, esc, fmtDate, renderBody, mountReactions, totalReactions, uploadImage, REACTIONS };
})();
