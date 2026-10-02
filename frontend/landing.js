/**
 * Signova — Landing Story & Presentation Layer
 *
 * True 3D Futuristic Holographic Hand Presentation Layer, Interactive Pipeline,
 * Live Studio preview on the real engines, and Live Studio presentation polish.
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
  // TRUE 3D HOLOGRAPHIC HAND MODEL — MediaPipe 21-Landmark Topology & Mesh
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

  // Secondary fine lattice neural micro-fibers across palm & knuckles
  const SECONDARY_CONNECTIONS = [
    [1, 5], [5, 9], [9, 13], [13, 17],
    [2, 6], [6, 10], [10, 14], [14, 18],
    [0, 9], [1, 9], [0, 13], [2, 9]
  ];

  // Translucent holographic 3D glass facets connecting the palm and finger bases
  const HAND_FACETS = [
    [0, 1, 2], [0, 2, 5], [0, 5, 9], [0, 9, 13], [0, 13, 17],
    [2, 5, 9], [5, 9, 13], [9, 13, 17],
    [5, 6, 10], [10, 6, 9], [9, 10, 14], [14, 10, 13], [13, 14, 18], [18, 14, 17]
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
        const tx = lerp(base[0], PALM[0], 0.35) + (ox - base[0]) * 0.18;
        const ty = lerp(base[1], PALM[1], 0.55) + 0.02 * k;
        const w = c * (0.35 + 0.22 * k);
        pts[idx][0] = lerp(ox, tx, clamp(w, 0, 1));
        pts[idx][1] = lerp(oy, ty, clamp(w, 0, 1));
        pts[idx][2] = -0.10 * c * k;
      }
    });
    return pts;
  }

  function blendCurl(a, b, t) {
    return a.map((v, i) => lerp(v, b[i], t));
  }

  /** Projects unit-space hand points to 2D canvas space. */
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

  /** Faint 2D wireframe fallback */
  function drawHand(ctx, P, o) {
    drawHand3D(ctx, P, o);
  }

  // Anatomical depth of each landmark: fingertips sit forward in space
  const HAND_DEPTH = [0.04, -0.02, -0.06, -0.10, -0.13, -0.03, -0.07, -0.10, -0.13, -0.03, -0.07, -0.11, -0.14,
    -0.03, -0.07, -0.10, -0.13, -0.02, -0.05, -0.08, -0.10];

  /** Perspective 3D projection with 3-axis Euler rotation matrix and focal perspective. */
  function projectHand3D(pts, o) {
    const cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0);
    const cy = Math.cos(o.yaw || 0), sy = Math.sin(o.yaw || 0);
    const cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0);
    const f = o.focal || 2.4;

    return pts.map(([x, y, z], i) => {
      const X = (o.mirror ? 1 - x : x) - 0.5;
      const Y = y - 0.58;
      const Z = (z || 0) + HAND_DEPTH[i];

      // Roll around Z
      const x1 = X * cr - Y * sr;
      const y1 = X * sr + Y * cr;
      const z1 = Z;

      // Yaw around Y
      const x2 = x1 * cy + z1 * sy;
      const y2 = y1;
      const z2 = -x1 * sy + z1 * cy;

      // Pitch around X
      const x3 = x2;
      const y3 = y2 * cp - z2 * sp;
      const z3 = y2 * sp + z2 * cp;

      // Perspective divide
      const k = f / (f + z3);
      const px = o.cx + x3 * o.s * k;
      const py = o.cy + y3 * o.s * k;

      return [px, py, z3, x3, y3, z3, k, i];
    });
  }

  /**
   * TRUE 3D HOLOGRAPHIC CRYSTAL GLASS HAND RENDERER
   * Reference-matched: Translucent glass volume with dual-tone refraction (cyan + warm amber wrist),
   * 21 glowing crystal landmark spheres, neural optical connections, 3D orbital gyro rings,
   * volumetric caustics, and micro-HUD telemetry crosshairs.
   */
  function drawHand3D(ctx, P, o) {
    o = o || {};
    const alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0.01) return;

    const t = o.t || 0;
    const lw = (o.lineWidth || 2) * DPR;
    const near = (z) => clamp(0.94 - z * 3.6, 0.45, 1.45);

    // Virtual key light in 3D space
    const L = [-0.45, -0.65, 0.61];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ------------------------------------------------------------------------
    // 1. VOLUMETRIC INTERNAL GLASS CAUSTICS & REFRACTION GLOW
    // ------------------------------------------------------------------------
    const pWrist = P[0];
    const pPalm = P[9];
    const pThumb = P[2];

    // Warm luminous amber/gold sub-surface glow at wrist/thenar root (exact reference match)
    const wristGlow = ctx.createRadialGradient(pWrist[0] + 15 * DPR, pWrist[1] - 8 * DPR, 0, pWrist[0], pWrist[1], 75 * DPR);
    wristGlow.addColorStop(0, 'rgba(251, 191, 36, ' + (0.24 * alpha).toFixed(3) + ')');
    wristGlow.addColorStop(0.4, 'rgba(245, 158, 11, ' + (0.12 * alpha).toFixed(3) + ')');
    wristGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = wristGlow;
    ctx.beginPath();
    ctx.arc(pWrist[0], pWrist[1], 75 * DPR, 0, Math.PI * 2);
    ctx.fill();

    // Deep cyan volumetric palm caustic
    const palmGlow = ctx.createRadialGradient(pPalm[0], pPalm[1], 0, pPalm[0], pPalm[1], 110 * DPR);
    palmGlow.addColorStop(0, 'rgba(56, 189, 248, ' + (0.32 * alpha).toFixed(3) + ')');
    palmGlow.addColorStop(0.5, 'rgba(14, 165, 233, ' + (0.16 * alpha).toFixed(3) + ')');
    palmGlow.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = palmGlow;
    ctx.beginPath();
    ctx.arc(pPalm[0], pPalm[1], 110 * DPR, 0, Math.PI * 2);
    ctx.fill();

    // ------------------------------------------------------------------------
    // 2. 3D TRANSLUCENT GLASS FACETS (Depth-sorted with Fresnel Edge Shading)
    // ------------------------------------------------------------------------
    const facetList = HAND_FACETS.map((fIndices) => {
      const p0 = P[fIndices[0]];
      const p1 = P[fIndices[1]];
      const p2 = P[fIndices[2]];
      const zAvg = (p0[2] + p1[2] + p2[2]) / 3;

      const v01 = [p1[3] - p0[3], p1[4] - p0[4], p1[5] - p0[5]];
      const v02 = [p2[3] - p0[3], p2[4] - p0[4], p2[5] - p0[5]];

      let nx = v01[1] * v02[2] - v01[2] * v02[1];
      let ny = v01[2] * v02[0] - v01[0] * v02[2];
      let nz = v01[0] * v02[1] - v01[1] * v02[0];
      const len = Math.hypot(nx, ny, nz) || 1e-4;
      nx /= len; ny /= len; nz /= len;

      const dotL = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const fresnel = Math.pow(1 - Math.abs(nz), 1.5);

      return { p0, p1, p2, zAvg, dotL, fresnel, fIndices };
    }).sort((a, b) => b.zAvg - a.zAvg);

    ctx.globalCompositeOperation = 'screen';
    facetList.forEach(({ p0, p1, p2, zAvg, dotL, fresnel, fIndices }) => {
      const n = near(zAvg);
      const isWristFacet = fIndices.includes(0) && (fIndices.includes(1) || fIndices.includes(2));
      const faceAlpha = (0.06 + dotL * 0.16 + fresnel * 0.10) * alpha * n;

      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();

      const grad = ctx.createLinearGradient(p0[0], p0[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
      if (isWristFacet) {
        grad.addColorStop(0, 'rgba(251, 191, 36, ' + (faceAlpha * 1.4).toFixed(3) + ')');
        grad.addColorStop(0.6, 'rgba(56, 189, 248, ' + (faceAlpha * 0.8).toFixed(3) + ')');
      } else {
        grad.addColorStop(0, 'rgba(56, 189, 248, ' + (faceAlpha * 1.3).toFixed(3) + ')');
        grad.addColorStop(0.5, 'rgba(14, 165, 233, ' + (faceAlpha * 0.7).toFixed(3) + ')');
      }
      grad.addColorStop(1, 'rgba(224, 242, 254, ' + (faceAlpha * (0.8 + dotL * 0.7)).toFixed(3) + ')');

      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle glass facet refraction outline
      ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.16 * alpha * n).toFixed(3) + ')';
      ctx.lineWidth = 0.85 * DPR;
      ctx.stroke();
    });

    // ------------------------------------------------------------------------
    // 3. 3D VOLUMETRIC GLASS CYLINDER BONES & CAUSTIC TUBES
    // ------------------------------------------------------------------------
    ctx.globalCompositeOperation = 'lighter';

    // Secondary micro-neural lattice lines
    SECONDARY_CONNECTIONS.forEach(([a, b]) => {
      const pA = P[a], pB = P[b];
      const zM = (pA[2] + pB[2]) / 2;
      const n = near(zM);
      ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.20 * alpha * n).toFixed(3) + ')';
      ctx.lineWidth = 0.9 * DPR;
      ctx.beginPath();
      ctx.moveTo(pA[0], pA[1]);
      ctx.lineTo(pB[0], pB[1]);
      ctx.stroke();
    });

    // Primary skeletal connections with volumetric glass capsule thickness
    const segs = CONNECTIONS.map(([a, b]) => {
      const zMid = (P[a][2] + P[b][2]) / 2;
      return { a, b, zMid };
    }).sort((u, v) => v.zMid - u.zMid);

    // Deep cyan bloom underlay
    segs.forEach(({ a, b, zMid }) => {
      const n = near(zMid);
      ctx.strokeStyle = 'rgba(2, 132, 199, ' + (0.24 * alpha * n).toFixed(3) + ')';
      ctx.lineWidth = lw * 5.2 * n;
      ctx.beginPath();
      ctx.moveTo(P[a][0], P[a][1]);
      ctx.lineTo(P[b][0], P[b][1]);
      ctx.stroke();
    });

    // Volumetric glass cylinder with Fresnel edge reflections
    segs.forEach(({ a, b, zMid }) => {
      const n = near(zMid);
      const isBase = a === 0 || a === 5 || a === 9 || a === 13 || a === 17;
      const boneWidth = (isBase ? lw * 2.3 : lw * 1.6) * n;

      // Outer glass capsule rim
      ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.88 * alpha * clamp(n, 0.5, 1.25)).toFixed(3) + ')';
      ctx.lineWidth = boneWidth;
      ctx.beginPath();
      ctx.moveTo(P[a][0], P[a][1]);
      ctx.lineTo(P[b][0], P[b][1]);
      ctx.stroke();

      // Sharp white specular optical spine
      ctx.strokeStyle = 'rgba(240, 249, 255, ' + (0.95 * alpha * clamp(n, 0.65, 1.0)).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.9 * DPR, boneWidth * 0.32);
      ctx.beginPath();
      ctx.moveTo(P[a][0], P[a][1]);
      ctx.lineTo(P[b][0], P[b][1]);
      ctx.stroke();
    });

    // ------------------------------------------------------------------------
    // 4. 3D HOLOGRAPHIC GYRO RINGS (Multi-axis Orbitals around Wrist & Palm)
    // ------------------------------------------------------------------------
    if (o.showGyro !== false) {
      const nWrist = near(pWrist[2]);
      const rWrist = 24 * DPR * nWrist;
      const angleW = t * 0.75;

      ctx.save();
      ctx.translate(pWrist[0], pWrist[1]);
      ctx.scale(1, 0.36);
      ctx.rotate(angleW);

      ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.50 * alpha * nWrist).toFixed(3) + ')';
      ctx.lineWidth = 1.3 * DPR;
      ctx.setLineDash([5 * DPR, 6 * DPR]);
      ctx.beginPath();
      ctx.arc(0, 0, rWrist, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(224, 242, 254, ' + (0.80 * alpha * nWrist).toFixed(3) + ')';
      ctx.lineWidth = 1.8 * DPR;
      ctx.setLineDash([2 * DPR, 16 * DPR]);
      ctx.beginPath();
      ctx.arc(0, 0, rWrist * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // 5. 3D CRYSTAL LANDMARK SPHERES (Depth-sorted with Dual-Tone Highlights)
    // ------------------------------------------------------------------------
    const sortedPoints = P.map((p, i) => ({ p, i })).sort((u, v) => v.p[2] - u.p[2]);

    sortedPoints.forEach(({ p, i }) => {
      const n = near(p[2]);
      const tip = i === 0 || i % 4 === 0;
      const baseR = (tip ? 4.5 : 3.0) * DPR;

      // Independent harmonic breathing pulse per landmark
      const pulse = 1 + 0.16 * Math.sin(t * 2.3 + i * 0.82);
      const r = baseR * n * pulse;

      // Outer cyan bloom aura
      const aura = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.4);
      aura.addColorStop(0, 'rgba(56, 189, 248, ' + (0.50 * alpha * n).toFixed(3) + ')');
      aura.addColorStop(0.5, 'rgba(2, 132, 199, ' + (0.20 * alpha * n).toFixed(3) + ')');
      aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 3.4, 0, Math.PI * 2);
      ctx.fill();

      // 3D Glass Sphere Body with off-center specular hotspot
      const specX = p[0] - r * 0.35;
      const specY = p[1] - r * 0.35;
      const sphereGrad = ctx.createRadialGradient(specX, specY, r * 0.08, p[0], p[1], r);
      sphereGrad.addColorStop(0, 'rgba(255, 255, 255, ' + (0.99 * alpha).toFixed(3) + ')');
      sphereGrad.addColorStop(0.25, 'rgba(224, 242, 254, ' + (0.94 * alpha).toFixed(3) + ')');
      sphereGrad.addColorStop(0.65, 'rgba(56, 189, 248, ' + (0.85 * alpha * n).toFixed(3) + ')');
      sphereGrad.addColorStop(1, 'rgba(3, 105, 161, ' + (0.58 * alpha * n).toFixed(3) + ')');

      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();

      // Pure white specular hotspot pin
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (alpha * clamp(n, 0.7, 1)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(specX, specY, Math.max(0.7 * DPR, r * 0.30), 0, Math.PI * 2);
      ctx.fill();
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
      if (l.running) { l.fn(now / 1000, dt); any = true; }
    }
    if (any) rafId = requestAnimationFrame(tick);
  }

  function addLoop(el, fn) {
    const entry = { el, fn, running: false };
    loops.push(entry);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        entry.running = e.isIntersecting;
        if (entry.running && !rafId) rafId = requestAnimationFrame(tick);
      });
    }, { threshold: 0.05 });
    io.observe(el);
    entry.running = true;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isLandingActive()) kick();
  });

  // ==========================================================================
  // DICTIONARY — Fallback phrases for offline demo mode
  // ==========================================================================
  const PREVIEW_SENTENCES = {
    'call doctor': {
      text: 'Please call a doctor.', source: 'exact',
      tr: {
        Marathi: 'कृपया डॉक्टरला कॉल करा.',
        Hindi: 'कृपया डॉक्टर को बुलाएं।',
        Gujarati: 'કૃપા કરીને ડૉક્ટરને કૉલ કરો.',
        Tamil: 'தயவுசெய்து ஒரு மருத்துவரை அழைக்கவும்.',
        Telugu: 'దయచేసి డాక్టర్ని పిలవండి.'
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
  // HERO — wordmark reveal, ambient landmark hand, parallax, cursor glow
  // ==========================================================================
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
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

    // Pointer state: spring-damped parallax and 3D angle influence
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const hp = { x: 0, y: 0, on: false };
    const trails = [];

    if (finePointer && !reducedMotion) {
      section.addEventListener('pointermove', (e) => {
        const r = section.getBoundingClientRect();
        tmx = ((e.clientX - r.left) / r.width) * 2 - 1;
        tmy = ((e.clientY - r.top) / r.height) * 2 - 1;
        const cr = canvas.getBoundingClientRect();
        hp.x = e.clientX - cr.left;
        hp.y = e.clientY - cr.top;
        hp.on = true;

        const panel = parallaxEls[0];
        if (panel) {
          const pr = panel.getBoundingClientRect();
          panel.style.setProperty('--px', (((e.clientX - pr.left) / pr.width) * 100).toFixed(1) + '%');
          panel.style.setProperty('--py', (((e.clientY - pr.top) / pr.height) * 100).toFixed(1) + '%');
        }

        if (trails.length < 40 && Math.random() < 0.5) {
          trails.push({ x: hp.x, y: hp.y, life: 0, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 14 });
        }
      });

      section.addEventListener('pointerleave', () => {
        tmx = 0;
        tmy = 0;
        hp.on = false;
      });
    }

    let scrollY = 0;
    landing.addEventListener('scroll', () => { scrollY = landing.scrollTop; }, { passive: true });

    // Background depth motes
    const bgParticles = Array.from({ length: isMobile ? 20 : 45 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.25 + Math.random() * 0.75,
      s: Math.random() * 6.28
    }));

    // Multi-Axis 3D Orbital Rings with orbiting photon satellites (exact reference match)
    const orbitalRings = [
      { radX: 0.62, radY: 0.32, tilt: 0.35, rotZ: -0.22, speed: 0.30, photons: [0, 0.33, 0.66] },
      { radX: 0.54, radY: 0.28, tilt: -0.42, rotZ: 0.45, speed: -0.24, photons: [0.15, 0.72] },
      { radX: 0.46, radY: 0.22, tilt: 0.65, rotZ: -0.60, speed: 0.38, photons: [0.45] }
    ];

    const soft = (p) => p.map((c) => c * 0.65);
    const poses = [POSES.open, soft(POSES.vee), POSES.open, soft(POSES.point)];

    function paint(t, dt) {
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      // 1. Ambient Depth Stars / Photons
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      bgParticles.forEach((p) => {
        const x = ((p.x * w + mx * 16 * p.z) % w + w) % w;
        const y = ((((p.y - t * 0.008 * p.z) % 1) + 1) % 1) * h + my * 10 * p.z;
        ctx.fillStyle = 'rgba(125, 211, 252, ' + (0.12 + 0.24 * p.z * (0.5 + 0.5 * Math.sin(t * 1.5 + p.s))).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + p.z * 1.2, 0, 6.283);
        ctx.fill();
      });
      ctx.restore();

      // 2. Continuous Natural 3D Hand Motion & Pose Interpolation
      const cyc = (t / 3.4) % poses.length;
      const i = Math.floor(cyc);
      const curl = blendCurl(poses[i], poses[(i + 1) % poses.length], easeInOut(clamp((cyc - i) * 2 - 0.6, 0, 1)))
        .map((c, k) => c + Math.sin(t * 1.35 + k * 0.7) * 0.035);

      const narrow = w < 960;
      const ultraWide = w >= 1440;
      const pose = handPose(curl);

      // Strict Right-Side Alignment (outside the left 640px hero panel)
      const handCenterX = narrow ? w * 0.74 : (ultraWide ? w * 0.75 : w * 0.77);
      const handCenterY = h * 0.51 - scrollY * 0.10;
      const handScale = Math.min(h * 0.88, narrow ? w * 0.84 : w * 0.44);

      // Continuous 3D multi-axis rotation (yaw, pitch, roll) + mouse responsiveness
      const view3D = {
        cx: handCenterX + mx * 18,
        cy: handCenterY + my * 10 + Math.sin(t * 0.85) * 11, // Gentle continuous vertical float
        s: handScale,
        rot: -0.06 + Math.sin(t * 0.38) * 0.04,              // Subtle natural 3D roll
        yaw: Math.sin(t * 0.42) * 0.26 + mx * 0.58,         // Smooth continuous 3D yaw orbit + mouse
        pitch: -0.10 + Math.sin(t * 0.52) * 0.12 - my * 0.35,// Smooth continuous 3D pitch + mouse
        focal: 2.5
      };

      // 3. Deep Background Holographic Echo
      if (!narrow) {
        const echoView = {
          cx: view3D.cx + 32 + mx * 24,
          cy: view3D.cy - 16 + my * 14,
          s: view3D.s * 0.88,
          rot: view3D.rot,
          yaw: view3D.yaw * 1.25,
          pitch: view3D.pitch * 1.2,
          focal: 2.5
        };
        const echoP = projectHand3D(pose, echoView);
        drawHand3D(ctx, echoP, { lineWidth: 1.2, alpha: 0.12, t, showGyro: false });
      }

      // 4. Main 3D Holographic Hand Projection
      const P = projectHand3D(pose, view3D);

      // Soft interactive attraction toward pointer when nearby
      if (hp.on) {
        P.forEach((p) => {
          const dx = hp.x - p[0];
          const dy = hp.y - p[1];
          const d = Math.hypot(dx, dy);
          if (d < 150 && d > 0.1) {
            const k = (1 - d / 150) * 8;
            p[0] += (dx / d) * k;
            p[1] += (dy / d) * k;
          }
        });
      }

      // 5. Render 3D Orbital Rings (Behind Section: z >= 0)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orbitalRings.forEach((ring) => {
        const ringAngle = t * ring.speed;
        const rx = ring.radX * handScale;
        const ry = ring.radY * handScale;

        ctx.save();
        ctx.translate(view3D.cx, view3D.cy);
        ctx.rotate(ring.rotZ + view3D.rot);
        ctx.scale(1, Math.cos(ring.tilt));

        // Back-half dashed orbital track
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.lineWidth = 1.2 * DPR;
        ctx.setLineDash([6 * DPR, 10 * DPR]);
        ctx.beginPath();
        ctx.arc(0, 0, (rx + ry) / 2, Math.PI, Math.PI * 2);
        ctx.stroke();

        // Orbiting Photons on back-half
        ring.photons.forEach((pFrac) => {
          const ang = ringAngle + pFrac * Math.PI * 2;
          const sinA = Math.sin(ang);
          if (sinA < 0) { // Behind
            const px = Math.cos(ang) * ((rx + ry) / 2);
            const py = sinA * ((rx + ry) / 2);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.beginPath();
            ctx.arc(px, py, 2.0 * DPR, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.restore();
      });
      ctx.restore();

      // 6. Draw Primary 3D Hand (Translucent Glass Facets, Volumetric Bones, Crystal Spheres, Gyro Rings)
      const handAlpha = narrow ? 0.42 : 0.90;
      drawHand3D(ctx, P, { lineWidth: 2.4, alpha: handAlpha, t, showGyro: true });

      // 7. Render 3D Orbital Rings (Front Section: z < 0 with High Luminosity)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orbitalRings.forEach((ring) => {
        const ringAngle = t * ring.speed;
        const rx = ring.radX * handScale;
        const ry = ring.radY * handScale;

        ctx.save();
        ctx.translate(view3D.cx, view3D.cy);
        ctx.rotate(ring.rotZ + view3D.rot);
        ctx.scale(1, Math.cos(ring.tilt));

        // Front-half illuminated orbital track
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.lineWidth = 1.4 * DPR;
        ctx.setLineDash([8 * DPR, 8 * DPR]);
        ctx.beginPath();
        ctx.arc(0, 0, (rx + ry) / 2, 0, Math.PI);
        ctx.stroke();

        // Orbiting Photons on front-half with brilliant cyan bloom
        ring.photons.forEach((pFrac) => {
          const ang = ringAngle + pFrac * Math.PI * 2;
          const sinA = Math.sin(ang);
          if (sinA >= 0) { // In front
            const px = Math.cos(ang) * ((rx + ry) / 2);
            const py = sinA * ((rx + ry) / 2);

            const pGlow = ctx.createRadialGradient(px, py, 0, px, py, 10 * DPR);
            pGlow.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
            pGlow.addColorStop(0.35, 'rgba(56, 189, 248, 0.75)');
            pGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = pGlow;
            ctx.beginPath();
            ctx.arc(px, py, 10 * DPR, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(px, py, 2.4 * DPR, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.restore();
      });

      // 8. Micro-HUD Telemetry Corner Brackets (Exact Reference Match)
      if (!narrow) {
        const hudBoxW = handScale * 0.95;
        const hudBoxH = handScale * 1.15;
        const hx = view3D.cx - hudBoxW * 0.48;
        const hy = view3D.cy - hudBoxH * 0.52;
        const bLen = 14 * DPR;

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
        ctx.lineWidth = 1.2 * DPR;
        ctx.setLineDash([]);

        // Top-Left bracket
        ctx.beginPath();
        ctx.moveTo(hx, hy + bLen);
        ctx.lineTo(hx, hy);
        ctx.lineTo(hx + bLen, hy);
        ctx.stroke();

        // Bottom-Left bracket
        ctx.beginPath();
        ctx.moveTo(hx, hy + hudBoxH - bLen);
        ctx.lineTo(hx, hy + hudBoxH);
        ctx.lineTo(hx + bLen, hy + hudBoxH);
        ctx.stroke();

        // Top-Right telemetry badge
        ctx.fillStyle = 'rgba(224, 242, 254, 0.65)';
        ctx.font = '600 ' + Math.round(11 * DPR) + 'px var(--font-mono)';
        ctx.fillText('21 Landmarks', hx + hudBoxW - 80 * DPR, hy + 14 * DPR);

        // Right-side tag
        ctx.fillStyle = 'rgba(125, 211, 252, 0.55)';
        ctx.font = '500 ' + Math.round(10 * DPR) + 'px var(--font-mono)';
        ctx.fillText('Optical SLM Pipeline', hx + hudBoxW - 105 * DPR, hy + hudBoxH * 0.5);
      }

      // 9. Neural Energy Waves Travelling Wrist -> Fingertips
      FINGERS.forEach((chain, f) => {
        const ph = ((t * 0.58 + f * 0.18) % 1.7) / 1.7;
        if (ph > 0.94) return;
        const full = [0].concat(chain);
        const pos = ph * (full.length - 1);
        const k = Math.floor(pos);
        const a = P[full[k]];
        const b = P[full[Math.min(k + 1, full.length - 1)]];
        const x = lerp(a[0], b[0], pos - k);
        const y = lerp(a[1], b[1], pos - k);

        const spark = ctx.createRadialGradient(x, y, 0, x, y, 14 * DPR);
        spark.addColorStop(0, 'rgba(255, 255, 255, ' + (0.95 * handAlpha).toFixed(3) + ')');
        spark.addColorStop(0.3, 'rgba(56, 189, 248, ' + (0.65 * handAlpha).toFixed(3) + ')');
        spark.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = spark;
        ctx.beginPath();
        ctx.arc(x, y, 14 * DPR, 0, 6.283);
        ctx.fill();
      });

      // 10. Interactive Connections Glow near Cursor
      if (hp.on) {
        CONNECTIONS.forEach(([a, b]) => {
          const midX = (P[a][0] + P[b][0]) / 2;
          const midY = (P[a][1] + P[b][1]) / 2;
          const d = Math.hypot(hp.x - midX, hp.y - midY);
          if (d > 160) return;
          const glowA = (0.75 * (1 - d / 160) * handAlpha).toFixed(3);
          ctx.strokeStyle = 'rgba(224, 242, 254, ' + glowA + ')';
          ctx.lineWidth = 2.0 * DPR;
          ctx.beginPath();
          ctx.moveTo(P[a][0], P[a][1]);
          ctx.lineTo(P[b][0], P[b][1]);
          ctx.stroke();
        });
      }

      // 11. Pointer Particle Trail
      for (let n = trails.length - 1; n >= 0; n--) {
        const p = trails[n];
        p.life += dt;
        if (p.life > 0.85) { trails.splice(n, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.fillStyle = 'rgba(125, 211, 252, ' + (0.6 * (1 - p.life / 0.85)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 * DPR, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }

    if (reducedMotion) {
      paint(0, 0);
      window.addEventListener('resize', () => paint(0, 0));
      return;
    }

    addLoop(section, (t, dt) => {
      mx = lerp(mx, tmx, 0.08);
      my = lerp(my, tmy, 0.08);
      parallaxEls.forEach((el) => {
        const p = parseFloat(el.dataset.parallax) || 0;
        el.style.transform = 'translate3d(' + (mx * 10 * p).toFixed(2) + 'px, ' + (my * 8 * p - scrollY * 0.06 * p).toFixed(2) + 'px, 0)';
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
        btn.style.transform = `perspective(500px) translate(${dx.toFixed(1)}px, ${(dy - 2).toFixed(1)}px) rotateX(${(-dy * 0.9).toFixed(1)}deg) rotateY(${(dx * 0.7).toFixed(1)}deg)`;
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
    const section = document.getElementById('sec-pipeline');
    const track = document.getElementById('pipeline-track');
    const particle = document.getElementById('pipeline-particle');
    const detail = document.getElementById('pipeline-detail');
    const plane = document.getElementById('pipe3d-plane');
    const svg = document.getElementById('pipe3d-path');
    if (!section || !track || !detail) return;
    const numEl = document.getElementById('pipeline-detail-num');
    const titleEl = document.getElementById('pipeline-detail-title');
    const bodyEl = document.getElementById('pipeline-detail-body');
    const techEl = document.getElementById('pipeline-detail-tech');
    const NS = 'http://www.w3.org/2000/svg';

    // Desktop: nodes stand on a tilted floor and the journey is driven by scrolling.
    // Phones and reduced motion keep the simple vertical list.
    const spatial = window.matchMedia('(min-width: 1024px)').matches && !reducedMotion && !!plane && !!svg;
    if (spatial) {
      section.classList.add('is-3d');
      const sticky = document.createElement('div');
      sticky.className = 'pipe-sticky';
      while (section.firstChild) sticky.appendChild(section.firstChild);
      section.appendChild(sticky);
    }

    const nodes = [];
    const links = [];
    STAGES.forEach((st, i) => {
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
      n.innerHTML = `<span class="pipeline-node-dot"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${st.icon}</svg></span><span class="pipeline-node-label">${st.k}</span>`;
      n.addEventListener('click', () => { pauseUntil = performance.now() + 9000; setStage(i); });
      track.insertBefore(n, particle);
      nodes.push(n);
    });

    let current = -1;
    let pauseUntil = 0;
    let arriveTimer = 0;

    // ---- spatial layout: an S-curve across the floor plane ----
    let pathEl = null, flowEl = null, doneEl = null, pulseEl = null, stopLens = [], pathLen = 0;
    function layout3D() {
      const W = plane.clientWidth, H = plane.clientHeight;
      if (!W || !H) return;
      const pts = STAGES.map((_, i) => {
        const u = i / (STAGES.length - 1);
        return [W * (0.07 + u * 0.86), H * (0.62 - 0.28 * Math.sin(u * Math.PI * 1.15))];
      });
      nodes.forEach((n, i) => { n.style.left = `${pts[i][0]}px`; n.style.top = `${pts[i][1]}px`; });
      // Catmull-Rom → cubic Bézier through the node points
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
      }
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = `<defs><filter id="pipe-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <path class="p3-base" d="${d}"/><path class="p3-flow" d="${d}"/><path class="p3-done" d="${d}"/>
        <circle class="p3-pulse" r="7" filter="url(#pipe-bloom)"/>`;
      pathEl = svg.querySelector('.p3-base');
      flowEl = svg.querySelector('.p3-flow');
      doneEl = svg.querySelector('.p3-done');
      pulseEl = svg.querySelector('.p3-pulse');
      pathLen = pathEl.getTotalLength();
      // Length along the path at each node (sampled)
      stopLens = pts.map(([x, y]) => {
        let best = 0, bestD = Infinity;
        for (let L = 0; L <= pathLen; L += pathLen / 400) {
          const q = pathEl.getPointAtLength(L);
          const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (dd < bestD) { bestD = dd; best = L; }
        }
        return best;
      });
      doneEl.style.strokeDasharray = `${pathLen} ${pathLen}`;
      placePulse(stopLens[Math.max(0, current)] || 0);
      paintDone(stopLens[Math.max(0, current)] || 0);
    }
    function placePulse(L) {
      if (!pulseEl) return;
      const q = pathEl.getPointAtLength(L);
      pulseEl.setAttribute('cx', q.x.toFixed(1));
      pulseEl.setAttribute('cy', q.y.toFixed(1));
    }
    function paintDone(L) { if (doneEl) doneEl.style.strokeDashoffset = (pathLen - L).toFixed(1); }

    let tween = 0;
    function travel(fromL, toL, ms, done) {
      cancelAnimationFrame(tween);
      const t0 = performance.now();
      const step = (now) => {
        const k = easeInOut(clamp((now - t0) / ms, 0, 1));
        const L = lerp(fromL, toL, k);
        placePulse(L); paintDone(L);
        if (k < 1) tween = requestAnimationFrame(step); else if (done) done();
      };
      tween = requestAnimationFrame(step);
    }

    // ---- flat (phone) layout helpers ----
    function particleTo(i) {
      if (spatial || !particle) return;
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
      section.style.setProperty('--stage', i);
      const st = STAGES[i];
      numEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STAGES.length).padStart(2, '0')}`;
      titleEl.textContent = st.t;
      bodyEl.innerHTML = `<span class="fade-swap">${st.b}</span>`;
      techEl.innerHTML = st.tech.map((x) => `<span class="tech-chip mono-val fade-swap">${x}</span>`).join('');
      detail.classList.remove('bump');
      void detail.offsetWidth;
      detail.classList.add('bump');
    }

    // The pulse travels first; the stage lights up when it arrives
    function setStage(i, immediate) {
      if (i === current) return;
      const prev = current;
      current = i;
      clearTimeout(arriveTimer);
      if (spatial && stopLens.length) {
        const from = stopLens[Math.max(0, prev)] || 0;
        if (immediate || prev < 0) { placePulse(stopLens[i]); paintDone(stopLens[i]); activate(i); return; }
        travel(from, stopLens[i], 650 + 120 * Math.abs(i - prev), () => activate(i));
        return;
      }
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

    if (spatial) {
      layout3D();
      window.addEventListener('resize', layout3D);
      // Scroll drives the journey through the pinned section
      let pending = false;
      const onScroll = () => {
        pending = false;
        const header = 54;
        const max = section.offsetHeight - (landing.clientHeight - header);
        const p = clamp((landing.getBoundingClientRect().top + header - section.getBoundingClientRect().top) / Math.max(1, max), 0, 1);
        section.style.setProperty('--pp', p.toFixed(3));
        const idx = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length * 0.999));
        if (performance.now() > pauseUntil) setStage(idx);
      };
      landing.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(onScroll); } }, { passive: true });
      setStage(0, true);
      return;
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

    // Pointer over the studio box tilts the camera frame and turns the hand
    const studioTilt = { x: 0, y: 0, tx: 0, ty: 0 };
    if (finePointer && !reducedMotion) {
      box.addEventListener('pointermove', (e) => {
        const r = box.getBoundingClientRect();
        studioTilt.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
        studioTilt.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
        box.style.setProperty('--sx', studioTilt.tx.toFixed(3));
        box.style.setProperty('--sy', studioTilt.ty.toFixed(3));
      });
      box.addEventListener('pointerleave', () => {
        studioTilt.tx = 0; studioTilt.ty = 0;
        box.style.setProperty('--sx', '0'); box.style.setProperty('--sy', '0');
      });
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
      studioTilt.x = lerp(studioTilt.x, studioTilt.tx, 0.08);
      studioTilt.y = lerp(studioTilt.y, studioTilt.ty, 0.08);
      const P = projectHand3D(handPose(curl), {
        cx: w * 0.5, cy: h * 0.6, s: h * 1.02, rot: Math.sin(t * 0.6) * 0.04,
        yaw: studioTilt.x * 0.5 + Math.sin(t * 0.4) * 0.12, pitch: -studioTilt.y * 0.25
      });
      const accepted = tele.state === 'ACCEPTED';
      drawHand3D(ctx, P, { lineWidth: 2.2 });
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
      gx.classList.remove('fused', 'linked', 'langs-in');
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

      gx.classList.add('fused', 'langs-in');
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
  // 12. IMMERSIVE LAYER — eased scrolling, chapter progress, section depth,
  //     architecture reveal and the closing scene
  // ==========================================================================
  const CHAPTERS = ['sec-hero', 'sec-features', 'sec-pipeline', 'sec-studio', 'sec-research', 'sec-cta'];

  /** Eased wheel scrolling (desktop pointer only). Keyboard, touch and scrollbar stay native. */
  function initSmoothScroll() {
    if (!finePointer || reducedMotion) return;
    landing.style.scrollBehavior = 'auto';
    let pos = landing.scrollTop;
    let target = pos;
    let anim = 0;
    const max = () => landing.scrollHeight - landing.clientHeight;

    function step() {
      pos += (target - pos) * 0.11;
      if (Math.abs(target - pos) < 0.5) pos = target;
      landing.scrollTop = pos;
      anim = pos === target ? 0 : requestAnimationFrame(step);
    }
    landing.addEventListener('wheel', (e) => {
      if (e.ctrlKey || !isLandingActive() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.target.closest && e.target.closest('select, textarea, .modal-dialog')) return;
      const d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? landing.clientHeight : 1);
      if (!anim) pos = target = landing.scrollTop;
      target = clamp(target + d, 0, max());
      e.preventDefault();
      if (!anim) anim = requestAnimationFrame(step);
    }, { passive: false });
    // Any other scroll (keys, scrollbar, anchor links) re-syncs the eased position
    landing.addEventListener('scroll', () => { if (!anim) pos = target = landing.scrollTop; }, { passive: true });
  }

  /** "01 / 06" chapter counter, overall progress bar and per-section depth (--sd). */
  function initScrollProgress() {
    const num = document.getElementById('sp-num');
    const fill = document.getElementById('sp-fill');
    const wrap = document.getElementById('scroll-progress');
    const sections = CHAPTERS.map((id) => document.getElementById(id)).filter(Boolean);
    const heads = Array.from(document.querySelectorAll('#view-landing .section-head'));
    let chapter = -1;
    let pending = false;

    function update() {
      pending = false;
      const max = Math.max(1, landing.scrollHeight - landing.clientHeight);
      const top = landing.getBoundingClientRect().top;
      const mid = top + landing.clientHeight * 0.5;
      if (fill) fill.style.transform = `scaleY(${(landing.scrollTop / max).toFixed(4)})`;
      let idx = 0;
      sections.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= mid) idx = i; });
      if (idx !== chapter && num) {
        chapter = idx;
        num.textContent = String(idx + 1).padStart(2, '0');
        num.classList.remove('flip');
        void num.offsetWidth;
        num.classList.add('flip');
      }
      if (wrap) wrap.classList.toggle('visible', landing.scrollTop > 40);
      if (!reducedMotion) {
        heads.forEach((h) => {
          const r = h.getBoundingClientRect();
          if (r.bottom < top || r.top > top + landing.clientHeight) return;
          const d = clamp(((r.top + r.height / 2) - mid) / landing.clientHeight, -1, 1);
          h.style.setProperty('--sd', d.toFixed(3));
        });
      }
    }
    landing.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /** Architecture layers light up one after another, then data flows between them. */
  function initResearchStack() {
    const stack = document.getElementById('arch-stack');
    if (!stack) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => stack.classList.toggle('flowing', e.isIntersecting));
      if (entries[0].isIntersecting) stack.classList.add('in');
    }, { threshold: 0.25 });
    io.observe(stack);
  }

  /** Closing scene: a few drifting particles and a faint landmark hand. */
  function initFinale() {
    const section = document.getElementById('sec-cta');
    const canvas = document.getElementById('finale-canvas');
    if (!section || !canvas) return;
    const motes = Array.from({ length: isMobile ? 18 : 34 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, s: Math.random() * 6.28
    }));
    let mx = 0, my = 0;
    if (finePointer && !reducedMotion) {
      section.addEventListener('pointermove', (e) => {
        const r = section.getBoundingClientRect();
        mx = ((e.clientX - r.left) / r.width) * 2 - 1;
        my = ((e.clientY - r.top) / r.height) * 2 - 1;
      });
    }
    function paint(t) {
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      motes.forEach((p) => {
        const x = ((p.x * w + Math.sin(t * 0.2 + p.s) * 20 * p.z + mx * 12 * p.z) % w + w) % w;
        const y = ((((p.y - t * 0.008 * p.z) % 1) + 1) % 1) * h + my * 8 * p.z;
        ctx.fillStyle = `rgba(125, 211, 252, ${(0.12 + 0.28 * p.z * (0.5 + 0.5 * Math.sin(t * 1.3 + p.s))).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 0.6 + p.z * 1.4, 0, 6.283); ctx.fill();
      });
      ctx.restore();
      const P = projectHand3D(handPose(POSES.open.map((c, i) => 0.06 + Math.sin(t * 0.9 + i) * 0.05)), {
        cx: w * 0.5, cy: h * 0.72 + Math.sin(t * 0.6) * 6, s: Math.min(h * 1.1, w * 0.7),
        yaw: mx * 0.35 + Math.sin(t * 0.3) * 0.15, pitch: -my * 0.2
      });
      drawHand3D(ctx, P, { lineWidth: 1.6, alpha: 0.2 });
    }
    if (reducedMotion) { paint(0); window.addEventListener('resize', () => paint(0)); return; }
    addLoop(section, paint);
  }

  // ==========================================================================
  // BOOT
  // ==========================================================================
  function boot() {
    revealHero();
    initViewHooks();
    initHero();
    initCursorGlow();
    initReveals();
    initNav();
    initMicroInteractions();
    initPipeline();
    initStudioDemo();
    initStudioStatus();
    initStudioFx();
    initSmoothScroll();
    initScrollProgress();
    initResearchStack();
    initFinale();
    kick();
  }

  if (document.readyState === 'loading') {
    // Run after app.js's own DOMContentLoaded handler so showView exists and metrics are set
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  } else {
    boot();
  }
})();
