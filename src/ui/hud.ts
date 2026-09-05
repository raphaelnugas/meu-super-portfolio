import type { Brain } from '../graph/graph';
import type { Intro } from '../intro/intro';
import type { PortfolioData } from '../data/projects';

export function createHud(root: HTMLElement, brain: Brain, intro: Intro, data: PortfolioData) {
  root.innerHTML = `
    <div class="hud-top">
      <h2>Rede neural de projetos</h2>
      <p>Cada neurônio é um repositório do GitHub. Passe o mouse para ver a prévia, clique para aproximar.
         Arraste para girar, role para dar zoom.</p>
    </div>
    <div class="hud-controls">
      <div class="hud-row">
        <button class="hud-btn" data-act="explode" title="Explodir / recolher a rede">💥 Explodir</button>
        <button class="hud-btn" data-act="recenter" title="Enquadrar todos os neurônios">◎ Recentrar</button>
        <button class="hud-btn on" data-act="rotate" title="Giro automático">↻ Giro</button>
        <button class="hud-btn" data-act="top" title="Voltar à abertura">↑ Início</button>
      </div>
      <label class="hud-slider">Expandir <input type="range" min="0" max="100" value="0" aria-label="Expandir a rede" /></label>
    </div>
    <div class="legend"></div>
    <div class="hud-status"></div>`;

  const slider = root.querySelector<HTMLInputElement>('input[type=range]')!;
  const btn = (act: string) => root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!;

  // ---------- expandir / explodir ----------
  let anim = 0;
  let fitTimer = 0;
  function animateSpread(to: number, ms = 900) {
    cancelAnimationFrame(anim);
    clearTimeout(fitTimer);
    const from = brain.getSpread();
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = from + (to - from) * e;
      slider.value = String(Math.round(v * 100));
      brain.setSpread(v);
      if (k < 1) anim = requestAnimationFrame(step);
      // Quando a rede terminar de se reorganizar, a câmera reenquadra tudo.
      else fitTimer = window.setTimeout(() => brain.fit(1200), 1500);
    };
    anim = requestAnimationFrame(step);
  }
  slider.addEventListener('input', () => brain.setSpread(Number(slider.value) / 100));
  btn('explode').addEventListener('click', () => {
    const exploded = brain.getSpread() > 0.5;
    animateSpread(exploded ? 0 : 1);
    btn('explode').textContent = exploded ? '💥 Explodir' : '⌾ Recolher';
  });
  btn('recenter').addEventListener('click', () => brain.recenter());
  btn('rotate').addEventListener('click', () => {
    const on = !btn('rotate').classList.contains('on');
    btn('rotate').classList.toggle('on', on);
    brain.setAutoRotate(on);
  });
  btn('top').addEventListener('click', () => intro.toTop());

  // ---------- legenda por linguagem (clique filtra) ----------
  const legend = root.querySelector<HTMLElement>('.legend')!;
  for (const l of brain.languages()) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.color = l.color;
    chip.innerHTML = `<span class="dot"></span><span style="color:var(--fg)">${l.name}</span><span style="color:var(--muted)">${l.count}</span>`;
    chip.addEventListener('click', () => {
      const next = brain.getFocusLanguage() === l.name ? null : l.name;
      brain.setFocusLanguage(next);
      legend.querySelectorAll('.chip').forEach((c) => {
        const name = c.querySelector('span:nth-child(2)')!.textContent;
        c.classList.toggle('on', next === name);
        c.classList.toggle('dim', next !== null && next !== name);
      });
    });
    legend.appendChild(chip);
  }

  // ---------- status ----------
  const status = root.querySelector<HTMLElement>('.hud-status')!;
  const live = data.projects.filter((p) => p.live).length;
  const synced = data.generatedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.generatedAt))
    : '—';
  status.innerHTML = `${data.projects.length} projetos · ${brain.languages().length} linguagens<br/>` +
    `sincronizado com o GitHub em ${synced}${live ? `<br/>+${live} detectado${live > 1 ? 's' : ''} agora` : ''}`;
}
