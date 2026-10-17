/* Heavy scroll-driven text animation.
   Every effect is tied to scroll position, so text moves only while you scroll
   (the first title also plays a short intro when the page loads). */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeBack = t => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  const GLYPHS = '!<>-_\\/[]{}=+*^?#0123456789';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t0 = performance.now();

  // split a heading into words > letters, each letter with random fly-in/out values
  function splitText(el) {
    const text = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-label', text);
    const chars = [];
    text.split(' ').forEach((word, wi, all) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      [...word].forEach(letter => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = letter;
        w.appendChild(s);
        chars.push({
          el: s,
          x: rand(-160, 160), y: rand(80, 220),   // fly-in start
          ox: rand(-120, 120), oy: rand(60, 200), // fly-out end
          r: rand(-120, 120), r2: rand(-90, 90),  // Z rotation in / out
          rx: rand(-100, 100), rx2: rand(-80, 80) // X flip in / out
        });
      });
      el.appendChild(w);
      if (wi < all.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return chars;
  }

  const chaps = [...document.querySelectorAll('.chap')].map(el => {
    const h = el.querySelector('[data-split]');
    const label = el.querySelector('[data-scramble]');
    return {
      el,
      s: +el.dataset.s,
      e: +el.dataset.e,
      auto: 'auto' in el.dataset,
      noExit: 'noexit' in el.dataset,
      chars: h ? splitText(h) : [],
      label,
      labelText: label ? label.textContent : '',
      labelLast: '',
      line: el.querySelector('.line'),
      fades: [...el.querySelectorAll('[data-fade]')],
      pop: el.querySelector('[data-pop]')
    };
  });

  // pointer tilt: the whole text block leans toward your finger / mouse
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => {
    tx = e.clientX / innerWidth - 0.5;
    ty = e.clientY / innerHeight - 0.5;
  });

  function render(c, enter, exit, sp) {
    const n = c.chars.length;
    const hold = enter >= 1 && exit <= 0 && !reduce ? 1 : 0;

    // 1) letters: fly in with 3D flip + blur, wave while reading, fly out
    c.chars.forEach((ch, i) => {
      const ep = clamp((enter - (i / n) * 0.55) / 0.45);
      const xp = clamp((exit - (i / n) * 0.55) / 0.45);
      const e = easeBack(ep);
      const inv = 1 - e;
      const o = easeOut(xp);
      const wave = hold ? Math.sin(sp * 60 + i * 0.7) * 4 : 0;
      ch.el.style.opacity = (clamp(ep * 1.5) * (1 - o)).toFixed(3);
      ch.el.style.transform =
        'translate3d(' + (ch.x * inv + ch.ox * o).toFixed(1) + 'px,' +
        (ch.y * inv - ch.oy * o + wave).toFixed(1) + 'px,0) ' +
        'rotateX(' + (ch.rx * inv + ch.rx2 * o).toFixed(1) + 'deg) ' +
        'rotateZ(' + (ch.r * inv + ch.r2 * o).toFixed(1) + 'deg) ' +
        'scale(' + (0.3 + 0.7 * e - 0.5 * o).toFixed(3) + ')';
    });

    // 2) small label: scrambles through random symbols, then locks in
    if (c.label) {
      const L = c.labelText, m = L.length;
      let out = '';
      for (let i = 0; i < m; i++) {
        const p = clamp(enter * 1.5 - (i / m) * 0.5);
        if (L[i] === ' ' || p >= 1) out += L[i];
        else if (p <= 0) out += ' ';
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      if (out !== c.labelLast) { c.label.textContent = out; c.labelLast = out; }
      c.label.style.opacity = (1 - exit).toFixed(3);
      c.label.style.letterSpacing = (4 + (1 - enter) * 14).toFixed(1) + 'px';
    }

    // 3) orange line draws out, then retracts
    if (c.line) {
      const w = easeOut(clamp(enter * 1.2 - 0.2)) * (1 - easeOut(exit));
      c.line.style.transform = 'scaleX(' + w.toFixed(3) + ')';
    }

    // 4) paragraph: blur + rise reveal
    c.fades.forEach(f => {
      const p = easeOut(clamp((enter - 0.35) / 0.65));
      const q = easeOut(exit);
      f.style.opacity = (p * (1 - q)).toFixed(3);
      f.style.transform = 'translateY(' + ((1 - p) * 30 - q * 30).toFixed(1) + 'px)';
    });

    // 5) button: springy pop
    if (c.pop) {
      const p = easeBack(clamp((enter - 0.5) / 0.5));
      c.pop.style.opacity = (clamp(p * 2) * (1 - exit)).toFixed(3);
      c.pop.style.transform = 'scale(' + (0.4 + 0.6 * p).toFixed(3) + ')';
    }

    // 6) whole block tilts toward the pointer
    c.el.style.transform =
      'perspective(900px) rotateY(' + (cx * 10).toFixed(2) + 'deg) rotateX(' + (-cy * 8).toFixed(2) + 'deg)';
  }

  function update(sp) {
    const now = performance.now();
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    chaps.forEach(c => {
      const t = (sp - c.s) / (c.e - c.s);
      const active = t >= 0 && t <= 1;
      c.el.style.visibility = active ? 'visible' : 'hidden';
      if (!active) return;
      let enter = c.auto ? clamp((now - t0 - 300) / 1800) : clamp(t / 0.35);
      let exit = c.noExit ? 0 : clamp((t - 0.8) / 0.2);
      if (reduce) { enter = 1; exit = 0; }
      render(c, enter, exit, sp);
    });
  }

  window.TextFX = { update, restart: () => { t0 = performance.now(); } };
})();
