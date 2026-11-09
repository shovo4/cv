/* Self-contained confetti engine: a different effect for each "What I do" chip */
(function () {
  var canvas, ctx, parts = [], running = false, DPR = Math.min(2, window.devicePixelRatio || 1);
  var COLORS = ['#5B78F6', '#00cfff', '#f42a41', '#ffd166', '#06d6a0', '#ff8fab', '#ffffff'];
  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas'); canvas.className = 'hx-confetti';
    Object.assign(canvas.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 });
    document.body.appendChild(canvas); ctx = canvas.getContext('2d'); resize(); addEventListener('resize', resize);
  }
  function resize() { canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  function add(p) {
    parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0.25, drag: 0.985, life: 1, decay: rnd(0.006, 0.012), size: rnd(6, 11), rot: rnd(0, Math.PI * 2), vr: rnd(-0.2, 0.2), color: pick(COLORS), shape: 'rect', wobble: rnd(0, Math.PI * 2) }, p));
  }
  function drawStar(x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var rr = i % 2 ? r / 2.2 : r, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.wobble += 0.08; p.life -= p.decay;
      if (p.fn) p.fn(p);
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4)); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.shape === 'rect') { ctx.scale(1, Math.sin(p.wobble)); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (p.shape === 'star') drawStar(0, 0, p.size / 1.6);
      else if (p.shape === 'ribbon') { ctx.scale(Math.sin(p.wobble), 1); ctx.fillRect(-p.size / 6, -p.size, p.size / 3, p.size * 2); }
      else if (p.shape === 'text') { ctx.font = 'bold ' + p.size * 1.6 + 'px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text, 0, 0); }
      else if (p.shape === 'emoji') { ctx.font = p.size * 2 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text, 0, 0); }
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }

  var EFFECTS = {
    /* IT Support: classic two-sided cannon burst of confetti + a few tools */
    burst: function (x, y) {
      for (var i = 0; i < 160; i++) { var a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), s = rnd(6, 16); add({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, shape: pick(['rect', 'rect', 'circle', 'ribbon']) }); }
      for (var j = 0; j < 10; j++) add({ x: x, y: y, vx: rnd(-7, 7), vy: rnd(-14, -6), shape: 'emoji', text: pick(['🔧', '🖥️', '🔌', '🛠️']), size: 12, g: 0.3, vr: rnd(-0.1, 0.1) });
    },
    /* Software Developer: raining code glyphs in matrix green + accent */
    code: function (x, y) {
      var glyphs = ['{', '}', '<', '/>', ';', '()', '=>', '01', 'if', 'fn', '&&', '[]'];
      for (var i = 0; i < 90; i++) add({ x: rnd(0, innerWidth), y: rnd(-innerHeight * 0.5, -10), vx: rnd(-0.3, 0.3), vy: rnd(3, 7), g: 0.02, drag: 1, decay: rnd(0.004, 0.007), shape: 'text', text: pick(glyphs), size: rnd(7, 12), color: pick(['#06d6a0', '#80e7a2', '#5B78F6', '#ffffff']), vr: 0, rot: 0 });
      for (var j = 0; j < 40; j++) { var a = rnd(0, Math.PI * 2), s = rnd(4, 12); add({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, shape: 'text', text: pick(glyphs), size: 9, color: '#06d6a0', vr: 0 }); }
    },
    /* Web Developer: spiralling stars that drift up and twinkle */
    stars: function (x, y) {
      for (var i = 0; i < 110; i++) { var a = rnd(0, Math.PI * 2), r = rnd(2, 13); add({ x: x, y: y, vx: Math.cos(a) * r, vy: Math.sin(a) * r - 4, g: -0.02, drag: 0.97, decay: rnd(0.007, 0.012), shape: 'star', size: rnd(7, 15), color: pick(['#ffd166', '#fff3b0', '#00cfff', '#ffffff', '#5B78F6']), fn: function (p) { p.size += Math.sin(p.wobble * 2) * 0.25; } }); }
    },
    /* Cloud Architect: clouds puff up then it rains blue drops across the screen */
    rain: function (x, y) {
      for (var i = 0; i < 14; i++) add({ x: x + rnd(-80, 80), y: y + rnd(-30, 10), vx: rnd(-1.2, 1.2), vy: rnd(-3, -1), g: -0.03, drag: 0.98, decay: 0.012, shape: 'emoji', text: '☁️', size: rnd(12, 20), vr: 0, rot: 0 });
      for (var j = 0; j < 220; j++) add({ x: rnd(0, innerWidth), y: rnd(-innerHeight, -10), vx: 0, vy: rnd(9, 15), g: 0.05, drag: 1, decay: rnd(0.003, 0.006), shape: 'ribbon', size: rnd(5, 9), color: pick(['#00cfff', '#5B78F6', '#9ad8ff', '#ffffff']), vr: 0, rot: 0 });
    },
    /* UX Designer: fireworks — rockets that explode into colour rings */
    fireworks: function (x, y) {
      var count = 5;
      for (var k = 0; k < count; k++) (function (k) {
        var tx = innerWidth * (0.15 + 0.7 * Math.random()), ty = innerHeight * rnd(0.15, 0.45), col = pick(COLORS);
        add({ x: innerWidth / 2 + rnd(-60, 60), y: innerHeight, vx: (tx - innerWidth / 2) / 40, vy: -(innerHeight - ty) / 40 - 6, g: 0.18, drag: 1, decay: 0.028, shape: 'circle', size: 5, color: col, vr: 0,
          fn: function (p) { if (p.life < 0.03 && !p.done) { p.done = true; for (var i = 0; i < 90; i++) { var a = i / 90 * Math.PI * 2, s = rnd(3, 9); add({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.08, drag: 0.95, decay: rnd(0.01, 0.018), shape: pick(['circle', 'star']), size: rnd(4, 9), color: i % 2 ? col : '#ffffff', vr: rnd(-0.3, 0.3) }); } } } });
      })(k);
    }
  };

  function fire(kind, el) {
    ensure();
    var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    // skill tags: a lighter, local pop in the group's own colours
    if (el.classList.contains('sk-tag')) {
      var grp = el.closest('.sk-group'), cs = grp ? getComputedStyle(grp) : null;
      var c1 = cs && cs.getPropertyValue('--sk-c1').trim(), c2 = cs && cs.getPropertyValue('--sk-c2').trim();
      var cols = [c1 || '#5B78F6', c2 || '#00cfff', '#ffffff'];
      for (var i = 0; i < 70; i++) { var a = rnd(-Math.PI, 0) , sp = rnd(3, 10); add({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, shape: pick(['rect', 'circle', 'star']), size: rnd(4, 9), color: pick(cols), decay: rnd(0.012, 0.02) }); }
      add({ x: x, y: y - 10, vx: 0, vy: -3, g: 0, drag: .96, decay: 0.03, shape: 'text', text: el.textContent.trim(), size: 9, color: c1 || '#fff', vr: 0, rot: 0 });
      start(); el.classList.remove('hx-pop'); void el.offsetWidth; el.classList.add('hx-pop'); return;
    }
    (EFFECTS[kind] || EFFECTS.burst)(x, y); start();
    el.classList.remove('hx-pop'); void el.offsetWidth; el.classList.add('hx-pop');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-confetti]'); if (!b) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fire(b.dataset.confetti, b);
  });
  window.hxConfetti = fire;
})();
