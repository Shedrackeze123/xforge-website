/* XForge website: menu, reveal animations, counters, gallery lightbox, enquiry form */
(function () {
  // ===== EDIT THESE =====
  const CONFIG = {
    email: 'youremail@example.com',
    whatsapp: '',          // digits only with country code, e.g. 2348012345678 (leave '' to send enquiries by email)
  };
  // ======================

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const space = $('.space'), hdr = $('#hdr');

  // contact links
  $$('.js-mail').forEach(a => { a.href = 'mailto:' + CONFIG.email; a.textContent = CONFIG.email; });
  $$('.js-wa').forEach(a => {
    if (CONFIG.whatsapp) { a.href = 'https://wa.me/' + CONFIG.whatsapp; a.textContent = '+' + CONFIG.whatsapp; a.target = '_blank'; a.rel = 'noopener'; }
  });
  $('#yr').textContent = new Date().getFullYear();

  // header turns solid once the website scrolls over the video
  function onScroll() { hdr.classList.toggle('solid', scrollY > space.offsetHeight - innerHeight * 0.6); }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // mobile menu
  const btn = $('#menuBtn'), mnav = $('#mnav');
  function setMenu(open) {
    btn.classList.toggle('open', open);
    mnav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    mnav.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  btn.addEventListener('click', () => setMenu(!mnav.classList.contains('open')));

  // anchor links (jump instantly when the target is far, because the video lies in between)
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') { e.preventDefault(); return; }
    const t = id === '#top' ? document.body : $(id);
    if (!t) return;
    e.preventDefault();
    setMenu(false);
    const top = id === '#top' ? 0 : t.getBoundingClientRect().top + scrollY - 70;
    const far = Math.abs(top - scrollY) > innerHeight * 3;
    window.scrollTo({ top, behavior: far ? 'auto' : 'smooth' });
  }));

  // reveal on scroll
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.12 });
  $$('.rv').forEach(el => io.observe(el));

  // counters
  function count(el) {
    const to = +el.dataset.count, suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1700;
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  const co = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { count(en.target); co.unobserve(en.target); }
  }), { threshold: 0.6 });
  $$('[data-count]').forEach(el => co.observe(el));

  // gallery lightbox
  const lb = $('#lightbox'), lbImg = lb.querySelector('img');
  $$('[data-lb]').forEach(t => t.addEventListener('click', () => {
    const im = t.querySelector('img');
    lbImg.src = im.src; lbImg.alt = im.alt;
    lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false');
  }));
  const closeLb = () => { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); };
  lb.addEventListener('click', closeLb);
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeLb(); setMenu(false); } });

  // enquiry form: opens WhatsApp (if a number is set above) or the email app
  const form = $('#enquiry'), note = $('#formNote');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    const name = String(d.get('name') || '').trim();
    if (!name) { note.textContent = 'Please enter your name.'; return; }
    const lines = ['Hello XForge Construction,', 'My name is ' + name + '.', 'Project type: ' + d.get('type')];
    if (String(d.get('phone')).trim()) lines.push('Phone: ' + d.get('phone'));
    if (String(d.get('email')).trim()) lines.push('Email: ' + d.get('email'));
    if (String(d.get('msg')).trim()) lines.push('', d.get('msg'));
    const text = encodeURIComponent(lines.join('\n'));
    note.textContent = CONFIG.whatsapp ? 'Opening WhatsApp…' : 'Opening your email app…';
    location.href = CONFIG.whatsapp
      ? 'https://wa.me/' + CONFIG.whatsapp + '?text=' + text
      : 'mailto:' + CONFIG.email + '?subject=' + encodeURIComponent('Project enquiry from ' + name) + '&body=' + text;
  });

})();
