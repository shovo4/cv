/* Hero "digital rain" — code glyphs, hidden words, pointer/touch reactive, tap shockwaves */
(function () {
  var cv = document.getElementById('hx-rain'); if (!cv) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { cv.remove(); return; }
  var ctx = cv.getContext('2d'), hero = cv.parentElement, DPR = Math.min(2, devicePixelRatio || 1);
  var GLYPHS = ('0101010101010101' + '01{}<>[]();=+-*/#$%&|!?@' + '0110').split('');   // mostly binary, some code symbols
  var WORDS = ['SHOVO', 'SSH', 'PING', 'DEPLOY', 'VMWARE', 'DJANGO', 'REACT', 'SUDO', 'BUILD', 'DEBUG', 'EDMONTON', 'DHAKA', 'HELLO', 'CLOUD', 'LINUX', 'GIT PUSH', 'UPTIME', 'PYTHON'];
  var FS = 15, cols = [], w = 0, h = 0, running = false, last = 0;
  var ptr = { x: -9999, y: -9999, active: false, t: 0 }, waves = [], sparks = [];

  function resize() {
    w = hero.clientWidth; h = hero.clientHeight;
    cv.width = w * DPR; cv.height = h * DPR; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cols = [];
    for (var i = 0; i < Math.floor(w / FS); i++) cols.push(newCol(i, true));
    ctx.fillStyle = '#0F0F0F'; ctx.fillRect(0, 0, w, h);
  }
  function newCol(i, scatter) {
    var word = Math.random() < 0.08 ? WORDS[(Math.random() * WORDS.length) | 0] : null;
    return { i: i, y: scatter ? Math.random() * h : -FS * (2 + Math.random() * 18), speed: 0.5 + Math.random() * 1.1, hue: Math.random() < .5 ? 228 : 190, word: word, wi: 0, len: 6 + (Math.random() * 14) | 0, hist: [] };
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (t - last < 50) return; var dt = Math.min(100, t - last) / 50; last = t;

    ctx.fillStyle = 'rgba(15,15,15,0.16)'; ctx.fillRect(0, 0, w, h);
    ctx.font = FS + 'px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';

    var hot = ptr.active && t - ptr.t < 1500;
    for (var k = 0; k < cols.length; k++) {
      var c = cols[k], x = c.i * FS;
      var dx = x - ptr.x, dy = c.y - ptr.y, d2 = dx * dx + dy * dy, near = hot && d2 < 80 * 80;
      var pushed = 0;
      for (var wv = 0; wv < waves.length; wv++) {       // shockwaves: ring passes through -> columns jolt + flash
        var W = waves[wv], dd = Math.sqrt(dx * dx + dy * dy); if (Math.abs(dd - W.r) < 26) pushed = Math.max(pushed, 1 - Math.abs(dd - W.r) / 26);
      }
      var ch = c.word ? c.word[c.wi % c.word.length] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      // head
      var a = near ? .95 : pushed ? .9 : .6;
      ctx.fillStyle = c.word ? 'hsla(' + c.hue + ',100%,80%,' + a + ')' : (near || pushed ? '#ffffff' : 'hsla(' + c.hue + ',90%,72%,' + a + ')');
      if (near || pushed) { ctx.shadowColor = 'hsla(' + c.hue + ',100%,70%,.9)'; ctx.shadowBlur = 10; }
      ctx.fillText(ch, x, c.y); ctx.shadowBlur = 0;
      // dim echo one cell above
      ctx.fillStyle = 'hsla(' + c.hue + ',80%,55%,' + (c.word ? .35 : .2) + ')';
      ctx.fillText(c.word ? c.word[(c.wi + c.word.length - 1) % c.word.length] : GLYPHS[(Math.random() * GLYPHS.length) | 0], x, c.y - FS);

      var sp = c.speed * (near ? 2.2 : 1) * (pushed ? -0.6 : 1) * dt;   // the wave briefly pushes drops back up
      c.y += FS * sp; if (c.word) c.wi++;
      if (c.y > h + FS * 3) cols[k] = newCol(c.i, false);
    }

    // waves
    for (var i = waves.length - 1; i >= 0; i--) {
      var W2 = waves[i]; W2.r += 14 * dt; W2.life -= 0.02 * dt;
      ctx.beginPath(); ctx.arc(W2.x, W2.y, W2.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(91,120,246,' + (W2.life * .5) + ')'; ctx.lineWidth = 2; ctx.stroke();
      if (W2.life <= 0) waves.splice(i, 1);
    }
    // sparks (glyphs flung from a tap)
    for (var j = sparks.length - 1; j >= 0; j--) {
      var S = sparks[j]; S.x += S.vx * dt; S.y += S.vy * dt; S.vy += 0.35 * dt; S.life -= 0.025 * dt;
      ctx.fillStyle = 'hsla(' + S.hue + ',100%,75%,' + Math.max(0, S.life) + ')'; ctx.fillText(S.ch, S.x, S.y);
      if (S.life <= 0) sparks.splice(j, 1);
    }
    // cursor glow
    if (hot) {
      var g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 80);
      g.addColorStop(0, 'rgba(91,120,246,.14)'); g.addColorStop(1, 'rgba(91,120,246,0)');
      ctx.fillStyle = g; ctx.fillRect(ptr.x - 80, ptr.y - 80, 160, 160);
    }
  }

  function pos(e) { var r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; }
  function move(e) { var p = pos(e); ptr.x = p.x; ptr.y = p.y; ptr.active = true; ptr.t = performance.now(); }
  function tap(e) {
    var p = pos(e); waves.push({ x: p.x, y: p.y, r: 0, life: 1 });
    for (var i = 0; i < 26; i++) { var ang = rnd(0, Math.PI * 2), sp = rnd(2, 9); sparks.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 3, ch: GLYPHS[(Math.random() * GLYPHS.length) | 0], hue: Math.random() < .5 ? 228 : 190, life: 1 }); }
    move(e);
  }
  hero.addEventListener('mousemove', move);
  hero.addEventListener('mouseleave', function () { ptr.active = false; });
  hero.addEventListener('touchstart', function (e) { tap(e); }, { passive: true });
  hero.addEventListener('touchmove', move, { passive: true });
  hero.addEventListener('touchend', function () { ptr.active = false; });
  hero.addEventListener('click', function (e) { if (!e.target.closest('a,button')) tap(e); });

  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function stop() { running = false; }
  resize(); addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(hero); else start();
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
})();
