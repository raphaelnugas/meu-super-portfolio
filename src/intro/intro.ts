/**
 * Abertura controlada pelo scroll: os quadros do vídeo (retrato → giro 360° →
 * cérebro → sinapses) são desenhados num canvas conforme a posição da página.
 */
export interface IntroOptions {
  frameCount: number;
  framePath: (index: number) => string; // 1-based
  /** Fração do scroll dedicada ao vídeo (o resto é o crossfade para o grafo). */
  videoEnd: number;
}

export interface Intro {
  onProgress(cb: (p: number) => void): void;
  progress(): number;
  play(): void;
  toTop(): void;
  toEnd(): void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function createIntro(opts: IntroOptions): Intro {
  const canvas = document.getElementById('intro-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const overlay = document.getElementById('intro-overlay')!;
  const nameEl = overlay.querySelector<HTMLElement>('.intro-name')!;
  const hintEl = overlay.querySelector<HTMLElement>('.intro-hint')!;
  const loadingBar = document.getElementById('intro-loading')!;
  const progressBar = document.getElementById('intro-progress')!.firstElementChild as HTMLElement;
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;

  const frames: (HTMLImageElement | null)[] = new Array(opts.frameCount).fill(null);
  let loaded = 0;
  let drawnIndex = -1;
  let progress = 0;
  const listeners: ((p: number) => void)[] = [];

  // ---------- carregamento progressivo ----------
  function loadFrame(i: number): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        frames[i] = img;
        loaded++;
        (loadingBar.firstElementChild as HTMLElement).style.width = `${(loaded / opts.frameCount) * 100}%`;
        if (loaded === opts.frameCount) loadingBar.classList.add('done');
        if (i === targetIndex() || drawnIndex === -1) draw();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = opts.framePath(i + 1);
    });
  }
  async function preloadAll() {
    await loadFrame(0);
    // Quadros em ordem (o usuário rola a partir do início), com concorrência limitada.
    const queue = Array.from({ length: opts.frameCount - 1 }, (_, i) => i + 1);
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) await loadFrame(queue.shift()!);
    });
    await Promise.all(workers);
  }

  // ---------- desenho ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawnIndex = -1;
    draw();
  }
  function targetIndex() {
    const v = clamp(progress / opts.videoEnd, 0, 1);
    return Math.round(v * (opts.frameCount - 1));
  }
  function nearestLoaded(i: number) {
    for (let k = i; k >= 0; k--) if (frames[k]) return k;
    for (let k = i + 1; k < frames.length; k++) if (frames[k]) return k;
    return -1;
  }
  function draw() {
    const idx = nearestLoaded(targetIndex());
    if (idx < 0 || idx === drawnIndex) return;
    drawnIndex = idx;
    const img = frames[idx]!;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.fillStyle = '#03050d';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  // ---------- scroll ----------
  function maxScroll() {
    return document.documentElement.scrollHeight - innerHeight;
  }
  function onScroll() {
    // Sem rAF de propósito: o scroll já chega no ritmo do compositor e o
    // desenho de um único quadro é barato; assim funciona até em abas ocultas.
    progress = clamp(window.scrollY / Math.max(1, maxScroll()), 0, 1);
    draw();
    progressBar.style.width = `${progress * 100}%`;
    const fadeText = 1 - clamp(progress / 0.12, 0, 1);
    nameEl.style.opacity = String(fadeText);
    nameEl.style.transform = `translateY(${(1 - fadeText) * -20}px)`;
    hintEl.style.opacity = String(fadeText);
    hintEl.style.pointerEvents = fadeText > 0.2 ? 'auto' : 'none';
    listeners.forEach((cb) => cb(progress));
    scheduleMagnet();
  }

  // Se o usuário parar no meio do crossfade, "puxa" para o final (entra no cérebro).
  let magnetTimer = 0;
  function scheduleMagnet() {
    clearTimeout(magnetTimer);
    if (playing) return;
    magnetTimer = window.setTimeout(() => {
      if (progress > opts.videoEnd && progress < 0.985) toEnd();
    }, 320);
  }

  // ---------- "Assistir abertura": rola a página automaticamente ----------
  let playing = false;
  function play() {
    const start = window.scrollY;
    const end = maxScroll();
    const dur = Math.max(800, (1 - progress) * 12000);
    const t0 = performance.now();
    playing = true;
    btnPlay.textContent = '⏸ Pausar';
    const step = (now: number) => {
      if (!playing) return;
      const k = clamp((now - t0) / dur, 0, 1);
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, start + (end - start) * eased);
      if (k < 1) requestAnimationFrame(step);
      else stopPlaying();
    };
    requestAnimationFrame(step);
  }
  function stopPlaying() {
    playing = false;
    btnPlay.textContent = '▶ Assistir abertura';
  }
  btnPlay.addEventListener('click', () => (playing ? stopPlaying() : play()));
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    window.addEventListener(
      ev,
      (e) => {
        if (playing && !(e.target instanceof Element && e.target.closest('#btn-play'))) stopPlaying();
      },
      { passive: true },
    );
  }

  function toTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toEnd() {
    window.scrollTo({ top: maxScroll(), behavior: 'smooth' });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    resize();
    onScroll();
  });
  resize();
  preloadAll();
  onScroll();

  return {
    onProgress: (cb) => listeners.push(cb),
    progress: () => progress,
    play,
    toTop,
    toEnd,
  };
}
