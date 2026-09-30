/**
 * Signova — Landing Story & Presentation Layer
 *
 * Video-first opening with glass burst, compact landing story, interactive pipeline,
 * Live Studio preview on the real engines, and Live Studio presentation polish.
 *
 * Rules this file follows:
 * - Never touches the recognition WebSocket, the sign buffer or version_id.
 * - The gesture demo calls the real /api/sentence and /api/translate endpoints.
 * - Every animation loop runs only while its element is on screen, the tab is
 *   visible and the landing page is active, so the Live Studio is never slowed.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const landing = document.getElementById('view-landing');
  if (!landing) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  root.classList.add('js-anim');

  const isLandingActive = () => !body.classList.contains('studio-active');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ==========================================================================
  // HAND MODEL — MediaPipe 21-landmark topology (same indices as app.js)
  // ==========================================================================
  const HAND = [
    [0.50, 0.92],
    [0.38, 0.84], [0.29, 0.74], [0.23, 0.64], [0.18, 0.55],
    [0.40, 0.58], [0.38, 0.42], [0.37, 0.31], [0.36, 0.21],
    [0.50, 0.56], [0.50, 0.38], [0.50, 0.26], [0.50, 0.15],
    [0.59, 0.58], [0.61, 0.42], [0.62, 0.31], [0.63, 0.22],
    [0.67, 0.63], [0.71, 0.52], [0.74, 0.44], [0.76, 0.36]
  ];
  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];
  const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  const PALM = [0.52, 0.66];

  // Finger curl per pose: [thumb, index, middle, ring, pinky]
  const POSES = {
    open: [0, 0, 0, 0, 0],
    point: [0.7, 0, 0.95, 0.95, 0.95],
    vee: [0.7, 0, 0, 0.95, 0.95],
    fist: [0.55, 0.95, 0.95, 0.95, 0.95],
    call: [0, 0.95, 0.95, 0.95, 0]
  };

  /** Returns 21 [x, y, z] points in unit space for a curl vector. */
  function handPose(curl) {
    const pts = HAND.map(([x, y]) => [x, y, 0]);
    FINGERS.forEach((chain, f) => {
      const c = curl[f] || 0;
      if (!c) return;
      const base = HAND[chain[0]];
      for (let k = 1; k < chain.length; k++) {
        const idx = chain[k];
        const [ox, oy] = HAND[idx];
        // Fold each joint toward a point just above the palm, deeper for tips
        const tx = lerp(base[0], PALM[0], 0.35) + (ox - base[0]) * 0.18;
        const ty = lerp(base[1], PALM[1], 0.55) + 0.02 * k;
        const w = c * (0.35 + 0.22 * k);
        pts[idx][0] = lerp(ox, tx, clamp(w, 0, 1));
        pts[idx][1] = lerp(oy, ty, clamp(w, 0, 1));
        pts[idx][2] = -0.08 * c * k;
      }
    });
    return pts;
  }

  function blendCurl(a, b, t) {
    return a.map((v, i) => lerp(v, b[i], t));
  }

  /** Projects unit-space hand points to canvas space. */
  function projectHand(pts, o) {
    const cos = Math.cos(o.rot || 0);
    const sin = Math.sin(o.rot || 0);
    const yaw = Math.cos(o.yaw || 0);
    return pts.map(([x, y, z]) => {
      let ux = (o.mirror ? 1 - x : x) - 0.5;
      let uy = y - 0.6;
      ux *= yaw;
      const rx = ux * cos - uy * sin;
      const ry = ux * sin + uy * cos;
      return [o.cx + rx * o.s, o.cy + ry * o.s, z];
    });
  }

  /** Glowing wireframe hand; bloom is faked with a wide faint stroke under a thin one. */
  function drawHand(ctx, P, o) {
    const alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0.01) return;
    const lw = o.lineWidth || 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = `rgba(37, 99, 235, ${0.22 * alpha})`;
    ctx.lineWidth = lw * 4.5;
    ctx.beginPath();
    CONNECTIONS.forEach(([a, b]) => { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); });
    ctx.stroke();

    ctx.strokeStyle = `rgba(56, 189, 248, ${0.95 * alpha})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    CONNECTIONS.forEach(([a, b]) => { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); });
    ctx.stroke();

    const jr = o.jointRadius || lw * 1.5;
    P.forEach((p, i) => {
      const tip = i === 0 || i % 4 === 0;
      const r = tip ? jr * 1.3 : jr;
      ctx.fillStyle = `rgba(56, 189, 248, ${0.18 * alpha})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(240, 249, 255, ${alpha})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function fitCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * DPR) || canvas.height !== Math.round(h * DPR)) {
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx, w, h };
  }

  // ==========================================================================
  // FRAME SCHEDULER — one rAF loop, only for visible components
  // ==========================================================================
  const loops = [];
  let rafId = 0;
  let lastNow = 0;

  function tick(now) {
    rafId = 0;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;
    if (document.hidden || !isLandingActive()) return;
    let any = false;
    for (const l of loops) {
      if (l.visible) { l.frame(now / 1000, dt); any = true; }
    }
    if (any) rafId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!rafId && !reducedMotion) { lastNow = 0; rafId = requestAnimationFrame(tick); }
  }

  const loopObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const l = loops.find((x) => x.el === e.target);
      if (l) l.visible = e.isIntersecting;
    });
    kick();
  }, { rootMargin: '80px' });

  function addLoop(el, frame) {
    if (!el) return;
    loops.push({ el, frame, visible: false });
    loopObserver.observe(el);
  }

  document.addEventListener('visibilitychange', kick);

  // ==========================================================================
  // DEMO DATA — generated by this project's own sentence & translation engines
  // (used for the hero loop and as an offline copy if the API is unreachable)
  // ==========================================================================
  const DEMO = {
    'help doctor pain': {
      text: 'I need help from a doctor because I am in pain.', source: 'exact',
      tr: {
        Marathi: 'मला वेदना होत असल्याने मला डॉक्टरांकडून मदत हवी आहे.',
        Hindi: 'मुझे दर्द हो रहा है इसलिए मुझे डॉक्टर से मदद चाहिए।',
        Gujarati: 'મને ડૉક્ટરની મદદ જોઈએ છે કારણ કે મને દુખાવો થાય છે.',
        Tamil: 'எனக்கு வலி இருப்பதால் மருத்துவரிடம் உதவி தேவை.',
        Telugu: 'నాకు నొప్పిగా ఉన్నందున డాక్టర్ సహాయం కావాలి.'
      }
    },
    'help doctor': {
      text: 'I need help from a doctor.', source: 'exact',
      tr: {
        Marathi: 'मला डॉक्टरांची मदत हवी आहे.',
        Hindi: 'मुझे डॉक्टर से मदद चाहिए।',
        Gujarati: 'મને ડૉક્ટરની મદદની જરૂર છે.',
        Tamil: 'எனக்கு மருத்துவரிடம் இருந்து உதவி தேவை.',
        Telugu: 'నాకు డాక్టర్ సహాయం కావాలి.'
      }
    },
    'please help': {
      text: 'Please help me.', source: 'exact',
      tr: {
        Marathi: 'कृपया मला मदत करा.',
        Hindi: 'कृपया मेरी मदद करें।',
        Gujarati: 'કૃપા કરીને મને મદદ કરો.',
        Tamil: 'தயவுசெய்து எனக்கு உதவுங்கள்.',
        Telugu: 'దయచేసి నాకు సహాయం చేయండి.'
      }
    },
    hello: {
      text: 'Hello.', source: 'exact',
      tr: { Marathi: 'नमस्कार.', Hindi: 'नमस्ते।', Gujarati: 'નમસ્તે.', Tamil: 'வணக்கம்.', Telugu: 'నమస్కారం.' }
    }
  };
  const LANG_CODES = { Marathi: 'mr-IN', Hindi: 'hi-IN', Gujarati: 'gu-IN', Tamil: 'ta-IN', Telugu: 'te-IN' };

  // ==========================================================================
  // 1. OPENING — full-screen two-hand video, then crush → cracks → glass burst → landing
  //    (falls back to the same scene drawn in Canvas if the video cannot play)
  // ==========================================================================
  function initIntro() {
    const overlay = document.getElementById('intro-cinematic');
    const canvas = document.getElementById('intro-canvas');
    const skipBtn = document.getElementById('btn-skip-intro');

    const video = document.getElementById('intro-video');

    if (!root.classList.contains('play-intro') || !overlay || !canvas || reducedMotion) {
      root.classList.remove('play-intro');
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (overlay) overlay.remove();
      setTimeout(revealHero, 120);
      return;
    }

    overlay.hidden = false;

    const T_HIT = 1.7;         // hands collide
    const T_CRACK = 1.9;       // cracks start after the crush
    const T_SHATTER = 2.55;    // glass breaks, landing emerges behind the shards
    const T_END = 4.3;
    // ?introSpeed=0.25 slows the intro down for review; default is real time
    const SPEED = parseFloat((location.search.match(/introSpeed=([\d.]+)/) || [])[1]) || 1;
    // ?introAt=1.2 holds a single moment of the intro (review only)
    const HOLD = parseFloat((location.search.match(/introAt=([\d.]+)/) || [])[1]);

    // 'video' plays intro.mp4 first; 'canvas' draws the two hands itself (fallback / ?introMode=canvas)
    let mode = video && video.getAttribute('src') && !/introMode=canvas/.test(location.search) ? 'video' : 'canvas';
    let phase = mode === 'video' ? 'video' : 'transition';
    let snapshot = null;

    let W, H, C, diag, ctx;
    function resize() {
      const f = fitCanvas(canvas);
      ctx = f.ctx; W = f.w; H = f.h;
      C = [W / 2, H / 2];
      diag = Math.hypot(W, H);
    }
    resize();

    const rand = (a, b) => a + Math.random() * (b - a);

    // Dust with depth for parallax
    const dust = Array.from({ length: isMobile ? 40 : 80 }, () => ({
      x: Math.random(), y: Math.random(), z: rand(0.2, 1), p: Math.random() * 6.28
    }));

    // Sparks from the collision
    const sparks = Array.from({ length: isMobile ? 90 : 180 }, () => {
      const a = Math.random() * Math.PI * 2;
      return { a, v: rand(250, 1500), life: rand(0.5, 1.3), w: rand(0.6, 1.8), white: Math.random() < 0.35 };
    });

    // Crack rays: jittered polylines from the impact point to beyond the edges
    const RAYS = isMobile ? 11 : 15;
    const rays = [];
    for (let i = 0; i < RAYS; i++) {
      let a = (i / RAYS) * Math.PI * 2 + rand(-0.12, 0.12);
      const pts = [[0, 0]];
      let r = 0;
      const step = 0.06;
      while (r < 1.3) {
        a += rand(-0.14, 0.14);
        r += step * rand(0.7, 1.3);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const branches = [];
      for (let k = 2; k < pts.length - 2; k += 3) {
        if (Math.random() < 0.55) {
          let ba = Math.atan2(pts[k][1], pts[k][0]) + (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.9);
          const bp = [pts[k].slice()];
          for (let s = 0; s < 3; s++) {
            const last = bp[bp.length - 1];
            ba += rand(-0.2, 0.2);
            bp.push([last[0] + Math.cos(ba) * 0.045, last[1] + Math.sin(ba) * 0.045]);
          }
          branches.push({ at: Math.hypot(pts[k][0], pts[k][1]), pts: bp });
        }
      }
      rays.push({ pts, branches });
    }
    const RINGS = [0, 0.09, 0.2, 0.34, 0.52, 0.76, 1.3];

    function rayPointAt(ray, r) {
      const p = ray.pts;
      for (let k = 1; k < p.length; k++) {
        const r0 = Math.hypot(p[k - 1][0], p[k - 1][1]);
        const r1 = Math.hypot(p[k][0], p[k][1]);
        if (r1 >= r) {
          const t = (r - r0) / Math.max(1e-6, r1 - r0);
          return [lerp(p[k - 1][0], p[k][0], t), lerp(p[k - 1][1], p[k][1], t)];
        }
      }
      return p[p.length - 1];
    }

    // Shards: cells between neighbouring rays and rings
    const shards = [];
    for (let i = 0; i < RAYS; i++) {
      const A = rays[i];
      const B = rays[(i + 1) % RAYS];
      for (let j = 0; j < RINGS.length - 1; j++) {
        const poly = j === 0
          ? [[0, 0], rayPointAt(A, RINGS[1]), rayPointAt(B, RINGS[1])]
          : [rayPointAt(A, RINGS[j]), rayPointAt(A, RINGS[j + 1]), rayPointAt(B, RINGS[j + 1]), rayPointAt(B, RINGS[j])];
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        const d = Math.hypot(cx, cy);
        shards.push({
          poly: poly.map(([x, y]) => [x - cx, y - cy]),
          cx, cy, d,
          dir: [cx / (d || 1), cy / (d || 1)],
          spin: rand(-2.2, 2.2),
          delay: d * 0.32,
          drift: rand(40, 160),
          tint: rand(0, 1)
        });
      }
    }

    // Light streaks that race outward when the glass bursts
    const streaks = Array.from({ length: isMobile ? 36 : 72 }, () => ({
      a: Math.random() * Math.PI * 2, v: rand(900, 2600), len: rand(60, 260), w: rand(0.6, 2.2), delay: rand(0, 0.12)
    }));

    function drawStreaks(t) {
      const u = t - T_SHATTER;
      if (u < 0 || u > 1.1) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      streaks.forEach((s) => {
        const k = u - s.delay;
        if (k <= 0) return;
        const r0 = s.v * k;
        const r1 = r0 + s.len * (1 + k * 2);
        const al = clamp(1 - k / 0.8, 0, 1);
        const cs = Math.cos(s.a), sn = Math.sin(s.a);
        const g = ctx.createLinearGradient(C[0] + cs * r0, C[1] + sn * r0, C[0] + cs * r1, C[1] + sn * r1);
        g.addColorStop(0, 'rgba(56, 189, 248, 0)');
        g.addColorStop(1, `rgba(224, 242, 254, ${al})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(C[0] + cs * r0, C[1] + sn * r0);
        ctx.lineTo(C[0] + cs * r1, C[1] + sn * r1);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Shockwave ring from the impact point
    function drawShockwave(t) {
      const k = t - T_HIT;
      if (k < 0 || k > 0.7) return;
      const r = diag * 0.45 * easeOut(k / 0.7);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(186, 230, 253, ${0.7 * (1 - k / 0.7)})`;
      ctx.lineWidth = 3 + 10 * (1 - k / 0.7);
      ctx.beginPath(); ctx.arc(C[0], C[1], r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Impact "crush": the whole frame compresses inward, then releases
    function crushScale(t) {
      const k = (t - T_HIT) / 0.42;
      if (k <= 0 || k >= 1) return 1;
      return 1 - 0.075 * Math.sin(Math.PI * k) * (1 - 0.35 * k);
    }

    function drawDust(t, alpha) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      dust.forEach((d) => {
        const x = ((d.x + t * 0.01 * d.z) % 1) * W;
        const y = (d.y + Math.sin(t * 0.6 + d.p) * 0.004) * H;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.35 * d.z * alpha})`;
        ctx.beginPath(); ctx.arc(x, y, 0.6 + d.z * 1.4, 0, 6.283); ctx.fill();
      });
      ctx.restore();
    }

    // Hands drift in, then accelerate into the collision
    const approach = (x) => 0.22 * x + 0.78 * x * x * x;

    function handAt(side, p, t) {
      const s = Math.min(H * 0.72, W * 0.42);
      const startX = side < 0 ? s * 0.02 : W - s * 0.02;
      const endX = C[0] + side * s * 0.2;
      const breathe = Math.sin(t * 3 + (side < 0 ? 0 : 1.3)) * 0.04;
      return projectHand(handPose([0.1 + breathe, breathe, breathe, breathe, 0.08 + breathe]), {
        cx: lerp(startX, endX, p),
        cy: C[1] + s * 0.05 + Math.sin(t * 2.2 + side) * 6 * (1 - p),
        s,
        rot: side * (0.42 - 0.18 * p),
        mirror: side > 0,
        yaw: 0.35 * (1 - p)
      });
    }

    function drawHands(t) {
      if (t > T_HIT + 0.35) return;
      const fade = t < T_HIT ? 1 : 1 - (t - T_HIT) / 0.35;
      const lw = Math.max(1.4, Math.min(W, H) / 380);
      [-1, 1].forEach((side) => {
        const p = approach(clamp(t / T_HIT, 0, 1));
        // Motion blur: fading ghosts of earlier positions while accelerating
        for (let k = 4; k >= 1; k--) {
          const pk = approach(clamp((t - k * 0.035) / T_HIT, 0, 1));
          if (p - pk < 0.004) continue;
          drawHand(ctx, handAt(side, pk, t), { alpha: 0.16 * (1 - k / 5) * fade, lineWidth: lw });
        }
        const P = handAt(side, p, t);
        drawHand(ctx, P, { alpha: fade, lineWidth: lw });
        // Floor reflection
        ctx.save();
        const floorY = C[1] + Math.min(H * 0.72, W * 0.42) * 0.36;
        ctx.translate(0, floorY * 1.35);
        ctx.scale(1, -0.35);
        drawHand(ctx, P, { alpha: 0.12 * fade, lineWidth: lw });
        ctx.restore();
      });
    }

    function drawBurst(t) {
      const k = t - T_HIT;
      if (k < 0 || k > 1.4) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = diag * 0.55 * easeOut(clamp(k / 0.55, 0, 1));
      const a = clamp(1 - k / 0.9, 0, 1);
      const g = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], Math.max(1, r));
      g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * a})`);
      g.addColorStop(0.12, `rgba(186, 230, 253, ${0.75 * a})`);
      g.addColorStop(0.4, `rgba(56, 189, 248, ${0.28 * a})`);
      g.addColorStop(1, 'rgba(37, 99, 235, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (k < 0.22) {
        ctx.fillStyle = `rgba(224, 242, 254, ${0.62 * (1 - k / 0.22)})`;
        ctx.fillRect(0, 0, W, H);
      }
      sparks.forEach((s) => {
        if (k > s.life) return;
        const kk = 2.4;
        const d1 = s.v * (1 - Math.exp(-kk * k)) / kk;
        const d0 = s.v * (1 - Math.exp(-kk * Math.max(0, k - 0.045))) / kk;
        const al = 1 - k / s.life;
        ctx.strokeStyle = s.white ? `rgba(255,255,255,${al})` : `rgba(125, 211, 252, ${al})`;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(C[0] + Math.cos(s.a) * d0, C[1] + Math.sin(s.a) * d0);
        ctx.lineTo(C[0] + Math.cos(s.a) * d1, C[1] + Math.sin(s.a) * d1);
        ctx.stroke();
      });
      ctx.restore();
    }

    function strokePartial(pts, maxR, scale) {
      ctx.beginPath();
      ctx.moveTo(C[0] + pts[0][0] * scale, C[1] + pts[0][1] * scale);
      for (let k = 1; k < pts.length; k++) {
        const r = Math.hypot(pts[k][0], pts[k][1]);
        if (r > maxR) break;
        ctx.lineTo(C[0] + pts[k][0] * scale, C[1] + pts[k][1] * scale);
      }
      ctx.stroke();
    }

    function drawCracks(t) {
      if (t < T_CRACK) return;
      const q = easeOut(clamp((t - T_CRACK) / 0.85, 0, 1));
      const maxR = q * 1.3;
      const scale = diag * 0.62;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      [[5, 'rgba(56, 189, 248, 0.16)'], [1.3, 'rgba(224, 242, 254, 0.9)']].forEach(([lw, col]) => {
        ctx.lineWidth = lw;
        ctx.strokeStyle = col;
        rays.forEach((ray) => {
          strokePartial(ray.pts, maxR, scale);
          ray.branches.forEach((b) => { if (b.at < maxR - 0.05) strokePartial(b.pts, maxR + 1, scale); });
        });
        // Ring cracks connect neighbouring rays once the front has passed
        for (let j = 1; j < RINGS.length - 1; j++) {
          if (RINGS[j] > maxR - 0.04) continue;
          ctx.beginPath();
          for (let i = 0; i <= RAYS; i++) {
            const p = rayPointAt(rays[i % RAYS], RINGS[j]);
            const x = C[0] + p[0] * scale;
            const y = C[1] + p[1] * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // Freeze the video's current frame (same object-fit as on screen) to shatter it
    function captureFrame() {
      const off = document.createElement('canvas');
      off.width = Math.round(W * DPR);
      off.height = Math.round(H * DPR);
      const o = off.getContext('2d');
      o.setTransform(DPR, 0, 0, DPR, 0, 0);
      o.fillStyle = '#02060F';
      o.fillRect(0, 0, W, H);
      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      const fit = getComputedStyle(video).objectFit === 'contain' ? Math.min : Math.max;
      const k = fit(W / vw, H / vh);
      try { o.drawImage(video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k); } catch (e) { /* frame not ready */ }
      return off;
    }

    function drawShards(t) {
      const u = t - T_SHATTER;
      const scale = diag * 0.62;
      ctx.save();
      shards.forEach((s) => {
        const local = clamp((u - s.delay * 0.9) / 1.35, 0, 1);
        const z = easeIn(local) * 3.2;                       // camera flies forward
        const alpha = 1 - clamp((local - 0.45) / 0.55, 0, 1);
        if (alpha <= 0.01) return;
        const x = C[0] + s.cx * scale * (1 + z * 1.4) + s.dir[0] * s.drift * local;
        const y = C[1] + s.cy * scale * (1 + z * 1.4) + s.dir[1] * s.drift * local;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.spin * local * local);
        ctx.scale(1 + z, 1 + z);
        ctx.beginPath();
        s.poly.forEach(([px, py], i) => {
          const X = px * scale;
          const Y = py * scale;
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        });
        ctx.closePath();
        if (snapshot) {
          // The video frame itself breaks apart: each shard carries its piece of the image
          ctx.save();
          ctx.clip();
          ctx.globalAlpha = alpha;
          ctx.drawImage(snapshot, -(C[0] + s.cx * scale), -(C[1] + s.cy * scale), W, H);
          const sheen = ctx.createLinearGradient(-60, -60, 60, 60);
          sheen.addColorStop(0, 'rgba(186, 230, 253, 0.22)');
          sheen.addColorStop(0.5, 'rgba(3, 9, 22, 0.1)');
          sheen.addColorStop(1, 'rgba(56, 189, 248, 0.14)');
          ctx.fillStyle = sheen;
          ctx.fill();
          ctx.restore();
          ctx.lineWidth = 1.4 / (1 + z);
          ctx.strokeStyle = `rgba(224, 242, 254, ${(0.6 + 0.35 * s.tint) * alpha})`;
          ctx.stroke();
          ctx.restore();
          return;
        }
        // Dark glass with a faint reflection gradient
        const g = ctx.createLinearGradient(-60, -60, 60, 60);
        g.addColorStop(0, `rgba(28, 58, 110, ${0.92 * alpha})`);
        g.addColorStop(0.5, `rgba(3, 9, 22, ${0.98 * alpha})`);
        g.addColorStop(1, `rgba(10, 26, 58, ${0.95 * alpha})`);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1.2 / (1 + z);
        ctx.strokeStyle = `rgba(186, 230, 253, ${(0.55 + 0.4 * s.tint) * alpha})`;
        ctx.stroke();
        ctx.restore();
      });
      ctx.restore();
    }

    let start = 0;
    let finished = false;
    let revealed = false;
    let raf = 0;

    function beginReveal() {
      if (revealed) return;
      revealed = true;
      overlay.classList.add('revealing');
      root.classList.add('intro-revealing');
      setTimeout(revealHero, 180);
    }

    // Video → transition: snapshot the last frame, then remove the video entirely
    function startTransition() {
      if (phase === 'transition') return;
      phase = 'transition';
      clearTimeout(safety);
      if (mode === 'video' && video) {
        snapshot = captureFrame();
        ctx.drawImage(snapshot, 0, 0, W, H);   // no blank frame between video and canvas
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        start = 0;           // restart the clock at the impact moment
        startAt = T_HIT;
      }
    }

    function fallbackToCanvas() {
      if (phase !== 'video') return;
      mode = 'canvas';
      phase = 'transition';
      start = 0;
      startAt = 0;
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    }

    let startAt = 0;
    let safety = 0;
    if (mode === 'video') {
      video.addEventListener('ended', startTransition);
      video.addEventListener('error', fallbackToCanvas);
      // If autoplay was blocked or the file is slow, draw the scene instead of waiting on a black screen
      const bootCheck = setTimeout(() => { if (video.paused || video.readyState < 2 || video.dataset.blocked) fallbackToCanvas(); }, 2500);
      video.addEventListener('playing', () => clearTimeout(bootCheck), { once: true });
      safety = setTimeout(startTransition, 15000);
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(safety);
      if (video && video.isConnected) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
      beginReveal();
      overlay.classList.add('done');
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      setTimeout(() => {
        overlay.remove();
        root.classList.remove('play-intro', 'intro-revealing');
        root.classList.add('intro-played');
      }, 1500);
    }

    function frame(now) {
      if (phase === 'video') {             // the <video> is on screen; the canvas stays clear
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!start) start = now;
      const t = !isNaN(HOLD) && mode === 'canvas' ? HOLD : startAt + ((now - start) / 1000) * SPEED;
      if (t < T_SHATTER) {
        ctx.fillStyle = '#02060F';
        ctx.fillRect(0, 0, W, H);
        const k = crushScale(t);
        ctx.save();
        ctx.translate(C[0], C[1]);
        ctx.scale(k, k);
        ctx.translate(-C[0], -C[1]);
        if (snapshot) {
          ctx.drawImage(snapshot, 0, 0, W, H);
        } else {
          const vg = ctx.createRadialGradient(C[0], C[1], 0, C[0], C[1], diag * 0.6);
          vg.addColorStop(0, 'rgba(15, 40, 90, 0.55)');
          vg.addColorStop(1, 'rgba(2, 6, 15, 0)');
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, W, H);
          drawDust(t, 1);
          drawHands(t);
        }
        drawCracks(t);
        ctx.restore();
        drawShockwave(t);
        drawBurst(t);
      } else {
        beginReveal();
        ctx.clearRect(0, 0, W, H);
        drawShards(t);
        drawStreaks(t);
        drawBurst(t);
      }
      if (t >= T_END && (isNaN(HOLD) || mode === 'video')) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    // Skip Intro: remove the video and overlay right away and show the home page
    function skip() {
      if (finished) return;
      root.classList.add('intro-skipped');
      revealHero();
      finish();
    }

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); }
    }

    skipBtn.addEventListener('click', skip);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
  }

  // ==========================================================================
  // 2. HERO — wordmark reveal, ambient landmark hand, parallax, cursor glow
  // ==========================================================================
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.style.setProperty('--i', i++);
            s.textContent = part;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
  }

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    body.classList.add('hero-revealed');
  }

  function initHero() {
    document.querySelectorAll('.reveal-words').forEach(splitWords);

    const section = document.getElementById('sec-hero');
    const canvas = document.getElementById('hero-bg-canvas');
    const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));

    // Pointer state: parallax for the panel, attraction for the landmarks
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const hp = { x: 0, y: 0, on: false };
    const trails = [];
    if (finePointer && !reducedMotion) {
      section.addEventListener('pointermove', (e) => {
        const r = section.getBoundingClientRect();
        tmx = ((e.clientX - r.left) / r.width) * 2 - 1;
        tmy = ((e.clientY - r.top) / r.height) * 2 - 1;
        const cr = canvas.getBoundingClientRect();
        hp.x = e.clientX - cr.left; hp.y = e.clientY - cr.top; hp.on = true;
        const panel = parallaxEls[0];
        if (panel) {
          const pr = panel.getBoundingClientRect();
          panel.style.setProperty('--px', `${(((e.clientX - pr.left) / pr.width) * 100).toFixed(1)}%`);
          panel.style.setProperty('--py', `${(((e.clientY - pr.top) / pr.height) * 100).toFixed(1)}%`);
        }
        if (trails.length < 50 && Math.random() < 0.6) {
          trails.push({ x: hp.x, y: hp.y, life: 0, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 18 });
        }
      });
      section.addEventListener('pointerleave', () => { tmx = 0; tmy = 0; hp.on = false; });
    }

    let scrollY = 0;
    landing.addEventListener('scroll', () => { scrollY = landing.scrollTop; }, { passive: true });

    const particles = Array.from({ length: isMobile ? 24 : 60 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, s: Math.random() * 6.28
    }));
    const soft = (p) => p.map((c) => c * 0.6);   // partial curls keep the ambient hand readable
    const poses = [POSES.open, soft(POSES.vee), POSES.open, soft(POSES.point)];

    function paint(t, dt) {
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      // Depth particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p) => {
        const x = ((p.x * w + mx * 18 * p.z) % w + w) % w;
        const y = ((((p.y - t * 0.01 * p.z) % 1) + 1) % 1) * h + my * 12 * p.z;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.14 + 0.3 * p.z * (0.5 + 0.5 * Math.sin(t * 1.6 + p.s))})`;
        ctx.beginPath(); ctx.arc(x, y, 0.6 + p.z * 1.3, 0, 6.283); ctx.fill();
      });
      ctx.restore();

      // Large ambient landmark hand on the right, slowly changing pose
      const cyc = (t / 3.2) % poses.length;
      const i = Math.floor(cyc);
      const curl = blendCurl(poses[i], poses[(i + 1) % poses.length], easeInOut(clamp((cyc - i) * 2 - 0.6, 0, 1)))
        .map((c, k) => c + Math.sin(t * 1.4 + k) * 0.03);
      const narrow = w < 900;
      const P = projectHand(handPose(curl), {
        cx: (narrow ? w * 0.72 : w * 0.76) + mx * 16,
        cy: h * 0.62 + my * 10 - scrollY * 0.12 + Math.sin(t * 0.8) * 8,   // gentle float
        s: Math.min(h * 0.95, narrow ? w * 0.9 : w * 0.46),
        rot: -0.12 + mx * 0.06 + Math.sin(t * 0.5) * 0.03,
        yaw: mx * 0.3
      });
      // Landmarks lean gently toward the cursor
      if (hp.on) {
        P.forEach((p) => {
          const dx = hp.x - p[0], dy = hp.y - p[1];
          const d = Math.hypot(dx, dy);
          if (d < 160 && d > 0.1) { const k = (1 - d / 160) * 10; p[0] += (dx / d) * k; p[1] += (dy / d) * k; }
        });
      }
      const alpha = narrow ? 0.35 : 0.75;
      drawHand(ctx, P, { lineWidth: 2.2, alpha });

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Connections near the cursor brighten
      if (hp.on) {
        ctx.lineCap = 'round';
        CONNECTIONS.forEach(([a, b]) => {
          const d = Math.hypot(hp.x - (P[a][0] + P[b][0]) / 2, hp.y - (P[a][1] + P[b][1]) / 2);
          if (d > 170) return;
          ctx.strokeStyle = `rgba(224, 242, 254, ${(0.7 * (1 - d / 170) * alpha).toFixed(3)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
        });
      }
      // Pulses travelling wrist → fingertip
      FINGERS.forEach((chain, f) => {
        const ph = ((t * 0.55 + f * 0.19) % 1.8) / 1.8;
        if (ph > 0.95) return;
        const full = [0].concat(chain);
        const pos = ph * (full.length - 1);
        const k = Math.floor(pos);
        const a = P[full[k]];
        const b = P[full[Math.min(k + 1, full.length - 1)]];
        const x = lerp(a[0], b[0], pos - k);
        const y = lerp(a[1], b[1], pos - k);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
        g.addColorStop(0.35, `rgba(56,189,248,${0.55 * alpha})`);
        g.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.283); ctx.fill();
      });
      // Cursor particle trail
      for (let n = trails.length - 1; n >= 0; n--) {
        const p = trails[n];
        p.life += dt;
        if (p.life > 0.9) { trails.splice(n, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.6 * (1 - p.life / 0.9)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }

    if (reducedMotion) {
      paint(0, 0);
      window.addEventListener('resize', () => paint(0, 0));
      return;
    }

    addLoop(section, (t, dt) => {
      mx = lerp(mx, tmx, 0.07);
      my = lerp(my, tmy, 0.07);
      parallaxEls.forEach((el) => {
        const p = parseFloat(el.dataset.parallax) || 0;
        el.style.transform = `translate3d(${(mx * 10 * p).toFixed(2)}px, ${(my * 8 * p - scrollY * 0.06 * p).toFixed(2)}px, 0)`;
      });
      paint(t, dt);
    });
  }

  function initCursorGlow() {
    const glow = document.getElementById('cursor-glow');
    if (!glow || !finePointer || reducedMotion) { if (glow) glow.remove(); return; }
    let x = -999, y = -999, pending = false;
    landing.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      glow.classList.add('on');
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          glow.style.setProperty('--cx', `${x}px`);
          glow.style.setProperty('--cy', `${y}px`);
        });
      }
    }, { passive: true });
    landing.addEventListener('pointerleave', () => glow.classList.remove('on'));
  }

  // ==========================================================================
  // 3. SCROLL REVEALS, COUNT-UP, NAV INDICATOR
  // ==========================================================================
  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const text = el.textContent.trim();
    const m = text.match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/);
    if (!m || reducedMotion) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num);
    const decimals = (num.split('.')[1] || '').length;
    const t0 = performance.now();
    const dur = 1300;
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      el.textContent = `${pre}${(target * easeOut(p)).toFixed(decimals)}${post}`;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = text;
    };
    requestAnimationFrame(step);
  }

  function initReveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('.count-up').forEach(countUp);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('#view-landing .reveal').forEach((el) => io.observe(el));

    // Hero stats count up once the hero is revealed
    const statsIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const go = () => e.target.querySelectorAll('.count-up').forEach(countUp);
        if (heroRevealed) setTimeout(go, 400);
        else { const iv = setInterval(() => { if (heroRevealed) { clearInterval(iv); setTimeout(go, 500); } }, 150); }
        statsIo.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    const stats = document.querySelector('.hero-stats-row');
    if (stats) statsIo.observe(stats);
  }

  function initNav() {
    const links = Array.from(document.querySelectorAll('.landing-nav-link[data-target]'));
    const indicator = document.querySelector('.nav-active-indicator');
    const scrollToId = (id) => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    };
    document.querySelectorAll('#view-landing a[data-target]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); scrollToId(a.dataset.target); });
    });

    function setActive(id) {
      let active = null;
      links.forEach((l) => {
        const on = l.dataset.target === id;
        l.classList.toggle('active', on);
        if (on) { l.setAttribute('aria-current', 'true'); active = l; } else l.removeAttribute('aria-current');
      });
      if (!indicator) return;
      if (active) {
        indicator.style.opacity = '1';
        indicator.style.width = `${active.offsetWidth - 16}px`;
        indicator.style.transform = `translateX(${active.offsetLeft + 8}px)`;
      } else {
        indicator.style.opacity = '0';
      }
    }

    // Map story sections onto the nav item that covers them
    const owner = {
      'sec-hero': null, 'sec-features': 'sec-features', 'sec-pipeline': 'sec-pipeline',
      'sec-studio': 'sec-studio', 'sec-research': 'sec-research', 'sec-cta': 'sec-research'
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(owner[e.target.id]); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(owner).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ==========================================================================
  // 4. MICRO-INTERACTIONS — magnetic buttons, tilt cards
  // ==========================================================================
  function initMicroInteractions() {
    if (!finePointer || reducedMotion) return;

    document.querySelectorAll('#view-landing .magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
        btn.style.transform = `translate(${dx.toFixed(1)}px, ${(dy - 2).toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });

    document.querySelectorAll('#view-landing .tilt').forEach((card) => {
      card.addEventListener('pointerenter', () => card.classList.add('tilt-live'));
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(-(y - 0.5) * 5).toFixed(2)}deg`);
        card.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ==========================================================================
  // 5. INTERACTIVE AI PIPELINE — Hand → Landmarks → RF + LSTM → Sentence → Language
  // ==========================================================================
  const STAGES = [
    { k: 'HAND', t: 'Hand', icon: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
      b: 'A signer faces an ordinary webcam. The browser captures 640×480 video at about 30 FPS and shows a mirrored preview; video never leaves the device.',
      tech: ['getUserMedia', '640×480', '~30 FPS'] },
    { k: 'LANDMARKS', t: '21 Landmarks', icon: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="10" r="2"/><circle cx="18" cy="10" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 7v10M7.5 11.5 11 17.5M16.5 11.5 13 17.5"/>',
      b: 'MediaPipe Hands returns 21 3D landmarks per hand. Two hands become one 126-float vector, zero-filled when a hand is missing, sent over the /ws/recognition WebSocket.',
      tech: ['MediaPipe Hands', '126 floats', '/ws/recognition'] },
    { k: 'RF + LSTM', t: 'RF + LSTM', icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
      b: 'The Keras LSTM reads a (1, 30, 126) window across 20 signs, with the Random Forest from training as the per-frame baseline. A state machine accepts a sign only after 8 stable frames at ≥ 70% confidence.',
      tech: ['tensor (1, 30, 126)', '20 classes', 'ACCEPTED ≥ 70%'] },
    { k: 'SENTENCE', t: 'Sentence Engine', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      b: 'Accepted glosses become natural English from local templates and word packs, with an optional Gemini fallback. A monotonic version_id discards stale replies.',
      tech: ['POST /api/sentence', 'local_sentences.json', 'version_id'] },
    { k: 'LANGUAGE', t: 'Regional Language', icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      b: 'The sentence is translated into Marathi, Hindi, Gujarati, Tamil or Telugu from the local dictionary and voiced with Web Speech TTS.',
      tech: ['POST /api/translate', '5 languages', 'Web Speech TTS'] }
  ];

  function initPipeline() {
    const track = document.getElementById('pipeline-track');
    const particle = document.getElementById('pipeline-particle');
    const detail = document.getElementById('pipeline-detail');
    if (!track || !detail) return;
    const numEl = document.getElementById('pipeline-detail-num');
    const titleEl = document.getElementById('pipeline-detail-title');
    const bodyEl = document.getElementById('pipeline-detail-body');
    const techEl = document.getElementById('pipeline-detail-tech');

    const nodes = [];
    const links = [];
    STAGES.forEach((s, i) => {
      if (i > 0) {
        const l = document.createElement('span');
        l.className = 'pipeline-link';
        track.insertBefore(l, particle);
        links.push(l);
      }
      const n = document.createElement('button');
      n.type = 'button';
      n.className = 'pipeline-node';
      n.setAttribute('role', 'tab');
      n.setAttribute('aria-selected', 'false');
      n.innerHTML = `<span class="pipeline-node-dot"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span><span>${s.k}</span>`;
      n.addEventListener('click', () => { pauseUntil = performance.now() + 9000; setStage(i, true); });
      track.insertBefore(n, particle);
      nodes.push(n);
    });

    let current = -1;
    let pauseUntil = 0;
    let arriveTimer = 0;

    function particleTo(i) {
      const dot = nodes[i].querySelector('.pipeline-node-dot');
      const tr = track.getBoundingClientRect();
      const r = dot.getBoundingClientRect();
      particle.style.transform = `translate(${r.left - tr.left + r.width / 2}px, ${r.top - tr.top + r.height / 2}px)`;
    }

    function activate(i) {
      nodes.forEach((n, k) => {
        n.classList.toggle('active', k === i);
        n.classList.toggle('done', k < i);
        n.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      links.forEach((l, k) => l.classList.toggle('done', k < i));
      const s = STAGES[i];
      numEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STAGES.length).padStart(2, '0')}`;
      titleEl.textContent = s.t;
      bodyEl.innerHTML = `<span class="fade-swap">${s.b}</span>`;
      techEl.innerHTML = s.tech.map((x) => `<span class="tech-chip mono-val fade-swap">${x}</span>`).join('');
      detail.classList.remove('bump');
      void detail.offsetWidth;
      detail.classList.add('bump');
    }

    // The pulse travels first; the stage lights up when the pulse arrives
    function setStage(i, immediate) {
      const prev = current;
      current = i;
      clearTimeout(arriveTimer);
      particleTo(i);
      if (!immediate && prev === i - 1 && i > 0) {
        const l = links[i - 1];
        l.classList.remove('pulse');
        void l.offsetWidth;
        l.classList.add('pulse');
        arriveTimer = setTimeout(() => activate(i), 700);
      } else {
        activate(i);
      }
    }

    setStage(0, true);
    window.addEventListener('resize', () => particleTo(current));

    let visible = false;
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) particleTo(current);
    }, { threshold: 0.35 }).observe(track);
    if (reducedMotion) return;
    setInterval(() => {
      if (!visible || !isLandingActive() || document.hidden || performance.now() < pauseUntil) return;
      const next = (current + 1) % STAGES.length;
      setStage(next, next === 0);
    }, 2800);
  }

  // ==========================================================================
  // 6. REAL ENGINE HELPERS — /api/sentence, /api/translate, speech
  // ==========================================================================
  const MINI_HAND_SVG = (() => {
    const pts = HAND.map(([x, y]) => [x * 40, y * 40]);
    const lines = CONNECTIONS.map(([a, b]) => `M${pts[a][0].toFixed(1)} ${pts[a][1].toFixed(1)}L${pts[b][0].toFixed(1)} ${pts[b][1].toFixed(1)}`).join('');
    const dots = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4"/>`).join('');
    return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="${lines}" stroke="#38BDF8" stroke-width="1.1" fill="none" stroke-linecap="round"/><g fill="#F0F9FF">${dots}</g></svg>`;
  })();

  let demoVersion = 0;

  async function apiSentence(signs) {
    const version = ++demoVersion;
    const t0 = performance.now();
    const res = await fetch('/api/sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signs, version_id: version })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ...data, latency: Math.round(performance.now() - t0) };
  }

  async function apiTranslate(text, language) {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, version_id: demoVersion })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function speak(text, lang) {
    if (!text || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking) { synth.cancel(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const code = LANG_CODES[lang] || 'en-IN';
    u.lang = code;
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(code.split('-')[0]));
    if (v) u.voice = v;
    u.rate = 0.95;
    synth.speak(u);
  }

  // ==========================================================================
  // 7. LIVE STUDIO BOX — hand + telemetry ↔ detected signs → sentence → language
  // ==========================================================================
  function initStudioDemo() {
    const box = document.getElementById('studio-box');
    const gx = document.getElementById('gx');
    const canvas = document.getElementById('studio-hand-canvas');
    if (!box || !gx) return;
    const presets = Array.from(box.querySelectorAll('.gesture-preset'));
    const signsEl = document.getElementById('gx-signs');
    const linksSvg = document.getElementById('gx-links');
    const ctxEl = document.getElementById('gx-context');
    const sentenceEl = document.getElementById('gx-sentence');
    const transEl = document.getElementById('gx-translation');
    const sourceEl = document.getElementById('gx-source');
    const langBtns = Array.from(gx.querySelectorAll('.gx-lang'));
    const speakBtn = document.getElementById('gx-speak');
    const stateBadge = document.getElementById('studio-state-badge');
    const gaugeFill = document.getElementById('studio-gauge-fill');
    const gaugePct = document.getElementById('studio-gauge-pct');
    const GAUGE_C = 2 * Math.PI * 18;
    const step = reducedMotion ? 0 : 1;
    let runId = 0;
    let sentence = null;
    let lang = 'Marathi';
    const cache = {};

    // Telemetry shown next to the illustrative hand, following the real state machine's states
    const tele = { conf: 0.1, target: 0.1, state: 'IDLE', pose: POSES.open, lastPose: POSES.open, poseT: 1 };
    const SIGN_POSES = { help: POSES.open, doctor: POSES.point, pain: POSES.fist, please: POSES.open, hello: POSES.vee };
    function setState(state, target) {
      tele.state = state;
      tele.target = target;
      if (stateBadge) { stateBadge.textContent = state; stateBadge.dataset.state = state; }
    }
    function setPose(p) {
      tele.lastPose = blendCurl(tele.lastPose, tele.pose, easeInOut(clamp(tele.poseT, 0, 1)));
      tele.pose = p;
      tele.poseT = 0;
    }
    let lastPct = -1;
    function drawGauge() {
      const pct = Math.round(tele.conf * 100);
      if (pct === lastPct || !gaugeFill) return;
      lastPct = pct;
      gaugeFill.style.strokeDashoffset = (GAUGE_C * (1 - tele.conf)).toFixed(1);
      gaugePct.textContent = `${pct}%`;
    }

    function drawHandCanvas(t, dt) {
      if (!canvas) return;
      tele.conf = lerp(tele.conf, tele.target, reducedMotion ? 1 : 0.08);
      drawGauge();
      tele.poseT += dt / 0.6;
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const curl = blendCurl(tele.lastPose, tele.pose, easeInOut(clamp(tele.poseT, 0, 1)))
        .map((c, i) => c + Math.sin(t * 1.6 + i) * 0.025);
      const P = projectHand(handPose(curl), { cx: w * 0.5, cy: h * 0.6, s: h * 1.02, rot: Math.sin(t * 0.6) * 0.04 });
      const accepted = tele.state === 'ACCEPTED';
      drawHand(ctx, P, { lineWidth: 2 });
      if (accepted) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        CONNECTIONS.forEach(([a, b]) => { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); });
        ctx.stroke();
        ctx.restore();
      }
    }
    if (reducedMotion) {
      drawHandCanvas(0, 1);
      window.addEventListener('resize', () => drawHandCanvas(0, 1));
    } else {
      addLoop(canvas, drawHandCanvas);
    }

    function drawLinks() {
      const cards = Array.from(signsEl.querySelectorAll('.gx-sign'));
      const b0 = signsEl.getBoundingClientRect();
      linksSvg.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(b0.width))} ${Math.max(1, Math.round(b0.height))}`);
      let d = '';
      for (let i = 1; i < cards.length; i++) {
        const a = cards[i - 1].getBoundingClientRect();
        const b = cards[i].getBoundingClientRect();
        const ax = a.right - b0.left, ay = a.top - b0.top + a.height / 2;
        const bx = b.left - b0.left, by = b.top - b0.top + b.height / 2;
        d += `M${ax.toFixed(1)} ${ay.toFixed(1)} C${(ax + 16).toFixed(1)} ${ay.toFixed(1)} ${(bx - 16).toFixed(1)} ${by.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} `;
      }
      linksSvg.innerHTML = d ? `<path d="${d}" class="gx-link-path"/>` : '';
      const path = linksSvg.querySelector('path');
      if (path) path.style.setProperty('--len', Math.ceil(path.getTotalLength()) + 2);
    }

    async function translate(my) {
      if (!sentence) return;
      const key = `${sentence}|${lang}`;
      transEl.classList.remove('show');
      let out = cache[key];
      if (!out) {
        transEl.innerHTML = '<span class="flow-wait" aria-hidden="true"><i></i><i></i><i></i></span>';
        try {
          const d = await apiTranslate(sentence, lang);
          out = { text: d.text, note: d.has_error ? d.status : `translation engine · ${d.source}` };
        } catch (e) {
          const k = Object.keys(DEMO).find((x) => DEMO[x].text === sentence);
          out = { text: k ? DEMO[k].tr[lang] : sentence, note: 'offline copy' };
        }
        cache[key] = out;
      }
      if (my !== runId) return;
      transEl.textContent = out.text;
      void transEl.offsetWidth;
      transEl.classList.add('show');
      sourceEl.textContent = out.note;
    }

    async function run(key) {
      const my = ++runId;
      const signs = key.split(' ');
      gx.classList.remove('fused', 'linked');
      sentenceEl.innerHTML = '<span class="flow-wait" aria-hidden="true"><i></i><i></i><i></i></span>';
      transEl.textContent = '';
      transEl.classList.remove('show');
      sourceEl.textContent = '';
      ctxEl.innerHTML = '';
      linksSvg.innerHTML = '';
      signsEl.querySelectorAll('.gx-sign').forEach((n) => n.remove());
      const request = apiSentence(signs).catch(() => null);

      // Each sign: DETECTING → STABLE → ACCEPTED, then it appears as a glowing token
      for (let i = 0; i < signs.length; i++) {
        setPose(SIGN_POSES[signs[i]] || POSES.open);
        setState('DETECTING', 0.55);
        await wait(380 * step);
        setState('STABLE', 0.78);
        await wait(380 * step);
        if (my !== runId) return;
        setState('ACCEPTED', 0.93);
        const card = document.createElement('div');
        card.className = 'gx-sign';
        card.innerHTML = `${MINI_HAND_SVG}<span class="gx-token">${signs[i].toUpperCase()}</span>`;
        signsEl.appendChild(card);
        void card.offsetWidth;
        card.classList.add('recognized');
        await wait(420 * step);
        setState('COOLDOWN', 0.3);
        await wait(200 * step);
      }
      if (my !== runId) return;
      setState('IDLE', 0.08);
      setPose(POSES.open);
      drawLinks();
      gx.classList.add('linked');

      const data = await request;
      if (my !== runId) return;
      const offline = !data;
      const result = data || { text: DEMO[key].text, source: DEMO[key].source, version_id: null, latency: null };
      ctxEl.innerHTML = [
        ['match', offline ? 'offline copy' : result.source],
        ['version_id', result.version_id == null ? '—' : `v${result.version_id}`],
        ['latency', result.latency == null ? '—' : `${result.latency} ms`]
      ].map(([a, b], i) => `<span class="gx-ctx" style="animation-delay:${i * 90 * step}ms">${a} <b>${b}</b></span>`).join('');
      await wait(500 * step);
      if (my !== runId) return;

      gx.classList.add('fused');
      sentence = result.text;
      sentenceEl.innerHTML = sentence.split(' ').map((w, i) =>
        `<span class="gx-word" style="animation-delay:${i * 70 * step}ms">${w}</span>`).join(' ');
      await wait(700 * step);
      if (my !== runId) return;
      await translate(my);
    }

    presets.forEach((b) => b.addEventListener('click', () => {
      presets.forEach((x) => x.classList.toggle('active', x === b));
      run(b.dataset.signs);
    }));
    langBtns.forEach((b) => b.addEventListener('click', () => {
      lang = b.dataset.lang;
      langBtns.forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      translate(runId);
    }));
    speakBtn.addEventListener('click', () => speak(transEl.textContent, lang));
    window.addEventListener('resize', () => { if (gx.classList.contains('linked')) drawLinks(); });

    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        run((presets.find((p) => p.classList.contains('active')) || presets[0]).dataset.signs);
      }
    }, { threshold: 0.35 });
    io.observe(box);
  }

  // ==========================================================================
  // 8. LIVE STUDIO STATUS — real /api/health, /api/vocabulary and socket state
  // ==========================================================================
  function initStudioStatus() {
    const strip = document.getElementById('studio-status-strip');
    if (!strip) return;
    const set = (k, ok, text) => {
      const item = strip.querySelector(`[data-k="${k}"]`);
      if (!item) return;
      item.querySelector('.status-dot').className = `status-dot ${ok === true ? 'green' : ok === false ? '' : 'amber'}`;
      item.classList.toggle('bad', ok === false);
      item.querySelector('b').textContent = text;
    };
    const socket = () => {
      const s = body.dataset.ws;
      set('socket', s === 'online' ? true : s === 'offline' ? false : null,
        s === 'online' ? 'connected' : s === 'offline' ? 'offline, retrying' : 'connecting');
    };
    new MutationObserver(socket).observe(body, { attributes: true, attributeFilter: ['data-ws'] });

    async function refresh() {
      socket();
      try {
        const h = await (await fetch('/api/health')).json();
        set('engine', h.backend_online === true, h.backend_online ? h.status : 'offline');
        set('slm', true, h.gemini_configured ? `local + ${h.active_model}` : 'local templates (offline)');
      } catch (e) {
        set('engine', false, 'unreachable');
        set('slm', false, 'unknown');
      }
      try {
        const v = await (await fetch('/api/vocabulary')).json();
        set('model', v.count > 0, `${v.count} signs loaded`);
      } catch (e) {
        set('model', false, 'not loaded');
      }
    }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); refresh(); }
    });
    io.observe(strip);
  }

  // ==========================================================================
  // 9. LIVE STUDIO PRESENTATION — reacts to real data only
  // ==========================================================================
  function initStudioFx() {
    const retrigger = (el) => {
      if (!el || el.classList.contains('placeholder-text')) return;
      el.classList.remove('text-updated');
      void el.offsetWidth;
      el.classList.add('text-updated');
    };
    ['ai-sentence-display', 'translation-display'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      let last = el.textContent;
      new MutationObserver(() => {
        if (el.textContent === last) return;
        last = el.textContent;
        if (!reducedMotion) retrigger(el);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    // Mirror the real state machine state onto the camera card for its frame colour
    const badge = document.getElementById('telemetry-state-badge');
    const card = document.querySelector('.card-live-vision');
    if (badge && card) {
      new MutationObserver(() => { card.dataset.recState = badge.textContent.trim(); })
        .observe(badge, { childList: true, characterData: true, subtree: true });
    }
  }

  // ==========================================================================
  // 10. VIEW TRANSITIONS & LAUNCH BUTTONS
  // ==========================================================================
  function initViewHooks() {
    if (typeof window.showView === 'function') {
      const original = window.showView;
      window.showView = function (viewId) {
        const result = original.apply(this, arguments);
        if (viewId === 'view-landing') {
          kick();
        } else {
          document.dispatchEvent(new CustomEvent('signova:studio'));
          const glow = document.getElementById('cursor-glow');
          if (glow) glow.classList.remove('on');
        }
        return result;
      };
    }
    ['btn-launch-studio-showcase', 'btn-launch-studio-final'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => window.showView('view-studio'));
    });
    const brand = document.getElementById('btn-landing-brand-logo');
    if (brand) {
      brand.addEventListener('click', () => landing.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));
      brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); brand.click(); } });
    }
  }

  // ==========================================================================
  // BOOT
  // ==========================================================================
  function boot() {
    initViewHooks();
    initHero();
    initIntro();
    initCursorGlow();
    initReveals();
    initNav();
    initMicroInteractions();
    initPipeline();
    initStudioDemo();
    initStudioStatus();
    initStudioFx();
    kick();
  }

  if (document.readyState === 'loading') {
    // Run after app.js's own DOMContentLoaded handler so showView exists and metrics are set
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  } else {
    boot();
  }
})();
