import './styles.css';
import config from '../portfolio.config.json';
import { createIntro } from './intro/intro';
import { createBrain } from './graph/graph';
import { createCard } from './ui/card';
import { createHud } from './ui/hud';
import { renderFooter } from './ui/footer';
import { loadProjects } from './data/projects';

const BASE = import.meta.env.BASE_URL;
const FRAMES = 120;       // quadros em public/media/frames (12 fps × 10 s)
const VIDEO_END = 0.84;   // até aqui o scroll "toca" o vídeo
const FADE_START = 0.8;   // início do crossfade sinapses → rede 3D
const FADE_END = 0.97;    // a partir daqui o cérebro está ativo (mouse/roda controlam o 3D)

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// A abertura é uma história contada pelo scroll: sempre começa do topo.
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
const wrap = document.getElementById('graph-wrap')!;
const introCanvas = document.getElementById('intro-canvas')!;

const card = createCard(document.getElementById('card')!);
const brain = createBrain(document.getElementById('graph')!, {
  onHover: (p) => (p ? card.show(p) : card.hide()),
  onSelect: (p) => (p ? card.show(p, true) : card.hide(true)),
});
card.onClose(() => brain.deselect());
if (import.meta.env.DEV) {
  (window as any).__brain = brain;
  import('three').then((THREE) => ((window as any).__THREE = THREE));
}
window.addEventListener('mousemove', (e) => card.moveTo(e.clientX, e.clientY), { passive: true });

const intro = createIntro({
  frameCount: FRAMES,
  framePath: (i) => `${BASE}media/frames/f_${String(i).padStart(3, '0')}.webp`,
  videoEnd: VIDEO_END,
});

intro.onProgress((p) => {
  const fade = clamp((p - FADE_START) / (FADE_END - FADE_START), 0, 1);
  wrap.style.opacity = String(fade);
  introCanvas.style.opacity = String(1 - fade * fade);
  brain.setVisible(fade > 0);
  if (fade >= 1) brain.activate();
  else {
    brain.deactivate();
    card.hide(true);
  }
});

// Com o cérebro ativo, a roda do mouse é zoom do 3D, não scroll da página.
wrap.addEventListener('wheel', (e) => { if (wrap.classList.contains('active')) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { card.hide(true); brain.deselect(); }
  if (e.key === 'Home') intro.toTop();
  if (e.key === 'End') intro.toEnd();
});

loadProjects()
  .then((data) => {
    document.getElementById('intro-title')!.textContent = data.profile.name || config.name;
    document.getElementById('intro-headline')!.textContent = data.profile.headline || config.headline;
    brain.setData(data.projects);
    createHud(document.getElementById('hud')!, brain, intro, data);
    renderFooter(document.getElementById('footer')!, data.profile);
  })
  .catch((err: Error) => {
    console.error(err);
    document.getElementById('hud')!.innerHTML = `<div class="hud-error">Não consegui carregar os projetos.<br/><small>${err.message}</small></div>`;
  });
