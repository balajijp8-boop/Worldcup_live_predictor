/* =============================================================================
 * motion.js — Cinematic motion layer
 * -----------------------------------------------------------------------------
 * Scroll-reveal (blur-materialize), lightweight pointer 3D tilt, parallax, and
 * self-contained drag-and-drop media frames for user-supplied renders
 * (trophy / ball / jersey). No external dependencies. Principles drawn from
 * the design-motion + lightweight-3d skills: ease-out reveals, blur as a
 * "materializing" signal, layered depth, shadows over borders.
 * ========================================================================== */

var Motion = (() => {

  /* Scroll-reveal: opacity 0→1, translateY 28→0, blur 8→0 once in view.
   * IntersectionObserver primary + a scroll/resize rect fallback so content
   * can never get stuck hidden if the observer doesn't fire in a given host. */
  function setupReveal() {
    const els = [...document.querySelectorAll('[data-reveal]')];
    if (!els.length) return;
    const reveal = el => el.classList.add('in');

    const check = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      els.forEach(el => {
        if (el.classList.contains('in')) return;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) reveal(el);
      });
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });
      els.forEach(e => io.observe(e));
    }
    // Fallback + initial paint.
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    check();
    setTimeout(check, 300);
    // Absolute safety net: nothing stays invisible.
    setTimeout(() => els.forEach(reveal), 4000);
  }

  /* Lightweight pointer-driven 3D tilt with layered depth. */
  function setupTilt() {
    document.querySelectorAll('[data-tilt]').forEach(el => {
      if (el._tilt) return; el._tilt = true;
      const max = parseFloat(el.dataset.tilt) || 7;
      el.style.transformStyle = 'preserve-3d';
      el.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)';
      el.style.willChange = 'transform';
      el.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transition = 'transform .08s linear';
        el.style.transform = `perspective(1000px) rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        el.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
      });
    });
  }

  /* Subtle parallax drift on the atmospheric background while scrolling. */
  function setupParallax() {
    const layers = document.querySelectorAll('[data-parallax]');
    if (!layers.length) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        layers.forEach(l => {
          const speed = parseFloat(l.dataset.parallax) || 0.15;
          l.style.transform = `translate3d(0, ${y * speed}px, 0)`;
        });
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Self-contained drop-zones: drag an image (or click to browse) to fill a
   * media frame with your own render. Persists to localStorage (own keys only). */
  function setupDropzones() {
    document.querySelectorAll('[data-drop]').forEach(el => {
      if (el._drop) return; el._drop = true;
      const key = 'wcimg:' + el.dataset.drop;
      const cap = el.querySelector('[data-drop-cap]');
      const apply = url => {
        el.style.backgroundImage = `url(${url})`;
        el.style.backgroundSize = el.dataset.fit || 'contain';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
        el.setAttribute('data-filled', '1');
        if (cap) cap.style.display = 'none';
      };
      try { const saved = localStorage.getItem(key); if (saved) apply(saved); } catch (e) {}
      const read = file => {
        if (!file || !file.type || !file.type.startsWith('image/')) return;
        const fr = new FileReader();
        fr.onload = () => { try { localStorage.setItem(key, fr.result); } catch (e) {} apply(fr.result); };
        fr.readAsDataURL(file);
      };
      el.addEventListener('dragover', e => { e.preventDefault(); el.setAttribute('data-drag', '1'); });
      el.addEventListener('dragleave', () => el.removeAttribute('data-drag'));
      el.addEventListener('drop', e => {
        e.preventDefault(); el.removeAttribute('data-drag');
        read(e.dataTransfer.files && e.dataTransfer.files[0]);
      });
      el.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => read(inp.files[0]);
        inp.click();
      });
    });
  }

  /* Smooth-scroll anchor jumps for hero CTAs (avoids scrollIntoView). */
  function setupAnchors() {
    document.querySelectorAll('[data-goto]').forEach(btn => {
      if (btn._anch) return; btn._anch = true;
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.goto);
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  function setupAll() {
    setupReveal();
    setupTilt();
    setupParallax();
    setupDropzones();
    setupAnchors();
  }

  return { setupAll, setupReveal, setupTilt, setupParallax, setupDropzones, setupAnchors };
})();
