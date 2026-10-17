/* Scroll-scrubbed video + 3D X shape.
   The video is read ONCE at high speed into sharp JPEG frames, so scrolling
   is smooth. The page opens after ~1-2 seconds; the rest loads in the background. */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = t => t * t * (3 - 2 * t);
  const $ = id => document.getElementById(id);
  const v = $('v'), fc = $('f'), fx = fc.getContext('2d');
  const bar = $('bar'), loader = $('loader'), lbar = $('lbar');
  const shade = $('shade'), cta = $('finalCta'), cue = $('cue');
  const space = document.querySelector('.space');

  // Tuning
  const FPS = 8;          // frames kept per second of video
  const RATE = 3;         // how fast the video is read at load (higher = faster, riskier)
  const QUALITY = 0.82;   // JPEG quality
  const MAXW = 720;       // frame width in pixels (sharpness)
  const READY_AT = 1.5;   // open the page once this many seconds of video are ready

  const frames = [];      // { t, blob, bmp, busy }
  let tmp, tx, ready = false, lastKey = '', pending = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // the canvas is drawn at real screen resolution, so the picture stays sharp
  function fit() {
    fc.width = Math.round(innerWidth * DPR);
    fc.height = Math.round(innerHeight * DPR);
    lastKey = '';
  }
  fit();

  function drawCover(img, alpha) {
    const s = Math.max(fc.width / img.width, fc.height / img.height);
    const w = img.width * s, h = img.height * s;
    fx.globalAlpha = alpha;
    fx.drawImage(img, (fc.width - w) / 2, (fc.height - h) / 2, w, h);
  }

  /* ---------- playback from stored frames ---------- */
  function decode(f) {
    if (!f || f.bmp || f.busy) return;
    f.busy = true;
    createImageBitmap(f.blob)
      .then(b => { f.bmp = b; f.busy = false; lastKey = ''; })
      .catch(() => { f.busy = false; });
  }
  function evict(center) {
    for (let i = 0; i < frames.length; i++) {
      if (Math.abs(i - center) > 12 && frames[i].bmp) { frames[i].bmp.close(); frames[i].bmp = null; }
    }
  }
  function findIdx(t) {
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function nearestDecoded(i) {
    for (let d = 1; d < 12; d++) {
      if (frames[i - d] && frames[i - d].bmp) return frames[i - d];
      if (frames[i + d] && frames[i + d].bmp) return frames[i + d];
    }
    return null;
  }
  function drawVideo(progress) {
    const n = frames.length;
    if (!n || !v.duration) return;
    const t = progress * v.duration;
    const i = findIdx(t);
    const a = frames[i], b = frames[Math.min(i + 1, n - 1)];
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t)) : 0;
    for (let k = i - 3; k <= i + 8; k++) decode(frames[k]);
    evict(i);
    const key = i + ':' + f.toFixed(2) + ':' + (a.bmp ? 1 : 0) + (b.bmp ? 1 : 0);
    if (key === lastKey) return;
    const A = a.bmp ? a : nearestDecoded(i);
    if (!A) return;
    lastKey = key;
    fx.clearRect(0, 0, fc.width, fc.height);
    drawCover(A.bmp, 1);
    if (f > 0.03 && b.bmp && A === a && b !== a) drawCover(b.bmp, f); // blend = smoother
    fx.globalAlpha = 1;
  }

  /* ---------- reading the video into frames ---------- */
  function reveal() {
    if (ready) return;
    ready = true;
    loader.classList.add('done');
    if (window.TextFX && TextFX.restart) TextFX.restart();
  }
  function checkReady() {
    if (!frames.length) return;
    const last = frames[frames.length - 1].t;
    lbar.style.width = Math.min(100, (last / READY_AT) * 100) + '%';
    if (last >= READY_AT) reveal();
  }
  function grab(t) {
    tx.drawImage(v, 0, 0, tmp.width, tmp.height);
    pending++;
    tmp.toBlob(blob => {
      pending--;
      if (blob) {
        frames.push({ t, blob, bmp: null, busy: false });
        frames.sort((p, q) => p.t - q.t);
        lastKey = '';
      }
      checkReady();
    }, 'image/jpeg', QUALITY);
  }

  // fast path: play the video quickly and copy frames as they appear
  function extractFast() {
    return new Promise((resolve, reject) => {
      let next = 0, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        grab(v.duration);
        v.pause();
        resolve();
      };
      const step = (now, meta) => {
        if (done) return;
        if (meta.mediaTime >= next - 0.001) { grab(meta.mediaTime); next = meta.mediaTime + 1 / FPS; }
        if (meta.mediaTime >= v.duration - 0.05) { finish(); return; }
        v.requestVideoFrameCallback(step);
      };
      v.addEventListener('ended', finish, { once: true });
      v.playbackRate = RATE;
      v.play().then(() => v.requestVideoFrameCallback(step)).catch(reject);
    });
  }
  // slow fallback for browsers without requestVideoFrameCallback
  function seek(t) {
    return new Promise(res => {
      let d = false;
      const fin = () => { if (d) return; d = true; v.removeEventListener('seeked', fin); res(); };
      v.addEventListener('seeked', fin);
      setTimeout(fin, 2500);
      v.currentTime = t;
    });
  }
  async function extractSeek() {
    const count = Math.max(2, Math.floor(v.duration * FPS));
    for (let i = 0; i < count; i++) {
      await seek(Math.max(i / FPS, 0.01));
      grab(i / FPS);
    }
  }

  async function start() {
    if (v.readyState < 1) {
      await new Promise(r => v.addEventListener('loadedmetadata', r, { once: true }));
    }
    const W = Math.min(MAXW, v.videoWidth || MAXW);
    const H = Math.round(W * (v.videoHeight || 1) / (v.videoWidth || 1));
    tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tx = tmp.getContext('2d');
    try {
      if ('requestVideoFrameCallback' in v) await extractFast();
      else await extractSeek();
    } catch (e) {
      try { await extractSeek(); } catch (e2) { /* ignore */ }
    }
  }
  start().catch(() => {}).then(() => setTimeout(reveal, 300));
  setTimeout(reveal, 9000); // never keep people waiting longer than this

  /* ---------- 3D X shape ---------- */
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
  cam.position.z = 6;
  const r = new THREE.WebGLRenderer({ canvas: $('c'), alpha: true, antialias: true });
  r.setSize(innerWidth, innerHeight);
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(3, 4, 5);
  scene.add(light);

  // The XForge logo emblem, traced from your logo and extruded into 3D
  const LOGO = {"dark":[[[0.2138,-0.2492],[0.2138,-0.2797],[0.2444,-0.2797],[0.2444,-0.2492]],[[0.1688,-0.2492],[0.1672,-0.2781],[0.1977,-0.2797],[0.1977,-0.2492]],[[0.2138,-0.2042],[0.2138,-0.2347],[0.2444,-0.2347],[0.2444,-0.2042]],[[0.1688,-0.2042],[0.1672,-0.2347],[0.1977,-0.2347],[0.1977,-0.2042]],[[0.4132,-0.0836],[0.4132,-0.217],[0.4341,-0.2315],[0.4357,-0.1061]],[[0.3537,-0.0193],[0.3537,-0.172],[0.3971,-0.2042],[0.3971,-0.0531]],[[0.1479,-0.1109],[0.0257,0.0161],[-0.2251,-0.1543],[-0.4904,-0.3006],[-0.2797,-0.3006],[-0.0997,-0.1286],[-0.1158,-0.1077],[-0.1093,-0.0981],[-0.0916,-0.1125],[-0.0048,-0.2058],[0.0418,-0.1801]],[[0.201,0.0322],[0.164,-0.0],[0.164,-0.1045],[0.201,-0.082]],[[0.2814,0.1399],[0.217,0.0868],[0.217,-0.0772],[0.2814,-0.1222]],[[0.217,0.3006],[0.1447,0.3006],[0.0804,0.2363],[-0.0579,0.1109],[-0.09,0.1399],[-0.2379,0.2958],[-0.5,0.2942],[-0.1785,-0.0273],[0.0161,0.1286]]],"orange":[[[0.5,-0.3006],[0.4132,-0.2347],[0.2138,-0.0965],[-0.1302,-0.3006],[-0.0675,-0.3006],[0.2074,-0.1399],[0.3039,-0.2042],[0.4309,-0.3006]],[[0.3392,-0.0016],[0.3232,-0.0096],[0.3232,-0.1511],[0.3408,-0.164]],[[0.2974,0.127],[0.2958,-0.1318],[0.3071,-0.1399],[0.3071,0.119]],[[0.3344,0.299],[0.2444,0.299],[0.0611,0.1447],[-0.4695,-0.2733],[-0.1929,-0.1093],[-0.0402,-0.008],[0.1238,0.1174]]]};
  const LOGO_W = 5;
  const X = new THREE.Group();
  function layer(list, color, metal, rough, z) {
    const shapes = list.map(poly => {
      const sh = new THREE.Shape();
      poly.forEach((q, i) => (i ? sh.lineTo(q[0] * LOGO_W, q[1] * LOGO_W) : sh.moveTo(q[0] * LOGO_W, q[1] * LOGO_W)));
      sh.closePath();
      return sh;
    });
    const m = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shapes, { depth: 0.3, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
    m.position.z = z;
    X.add(m);
  }
  layer(LOGO.dark, 0x1a1a1c, 0.45, 0.35, -0.25);
  layer(LOGO.orange, 0xff5a14, 0.25, 0.35, -0.1);
  scene.add(X);
  // Size the logo by the SHAPE of the screen (not the pixel width), so it fits
  // phones, tablets, desktops and Chrome's "Desktop site" mode alike.
  let baseScale = 0.46, portrait = true, visW = 2.8;
  function layout() {
    const aspect = innerWidth / innerHeight;
    portrait = aspect < 1.1;
    visW = 2 * 6 * Math.tan(55 * Math.PI / 360) * aspect;   // visible width at the logo
    baseScale = (visW * (portrait ? 0.78 : 0.34)) / LOGO_W;
  }
  layout();

  let p = 0, sp = 0, lastT = performance.now();
  addEventListener('scroll', () => {
    p = clamp(scrollY / Math.max(1, space.offsetHeight - innerHeight));
  });
  addEventListener('resize', () => {
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    r.setSize(innerWidth, innerHeight);
    layout();
    fit();
  });

  function loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    // The picture can only travel so fast, no matter how hard you flick.
    // MAX_SPEED 0.2 = the whole video takes at least 5 seconds. Lower = slower.
    const MAX_SPEED = 0.2;
    const lim = MAX_SPEED * dt;
    sp += Math.max(-lim, Math.min(lim, (p - sp) * Math.min(1, dt * 7)));
    const covered = scrollY > space.offsetHeight + 40;   // website fully covers the stage
    if (!covered) drawVideo(sp);

    // near the end: the X shrinks away, the dark overlay fades, the button appears
    const endFade = 1 - smooth(clamp((sp - 0.78) / 0.08));
    X.visible = endFade > 0.01;
    X.scale.setScalar(Math.max(0.0001, baseScale * endFade));
    X.rotation.y = Math.sin(sp * Math.PI * 6) * 0.55;
    X.rotation.x = Math.sin(sp * Math.PI * 4) * 0.16;
    X.rotation.z = Math.sin(sp * Math.PI * 3) * 0.05;
    X.position.x = Math.sin(sp * Math.PI * 2) * (portrait ? visW * 0.08 : visW * 0.14);
    X.position.y = (portrait ? 1.5 : 0.4) + Math.sin(sp * Math.PI * 8) * 0.12;
    if (!covered) r.render(scene, cam);

    shade.style.opacity = (1 - smooth(clamp((sp - 0.84) / 0.08))).toFixed(3);
    const q = smooth(clamp((sp - 0.9) / 0.06));
    cta.style.opacity = q.toFixed(3);
    cue.style.opacity = q.toFixed(3);
    cta.style.transform = 'translateY(' + ((1 - q) * 20).toFixed(1) + 'px)';
    cta.style.pointerEvents = q > 0.5 ? 'auto' : 'none';

    if (window.TextFX) TextFX.update(sp);
    bar.style.width = (sp * 100) + '%';
    requestAnimationFrame(loop);
  }
  loop();
})();
