import type { Project } from '../data/projects';
import { languageColor } from '../graph/neuron';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

/** Card de prévia do projeto: aparece no hover (segue o mouse) ou fixado no clique. */
export function createCard(root: HTMLElement) {
  root.innerHTML = `
    <div class="card-media">
      <video muted loop playsinline preload="none"></video>
      <img alt="" loading="lazy" referrerpolicy="no-referrer" />
      <div class="card-lang"><span class="dot"></span><span class="lang-name"></span></div>
      <span class="card-live" hidden>novo</span>
      <button class="card-close" type="button" aria-label="Fechar">×</button>
    </div>
    <div class="card-body">
      <h3 class="card-title"></h3>
      <p class="card-desc"></p>
      <div class="lang-bar"></div>
      <div class="lang-list"></div>
      <div class="card-tags"></div>
      <div class="card-meta"><span class="meta-text"></span><a target="_blank" rel="noopener">Abrir no GitHub ↗</a></div>
      <div class="card-hint">clique no neurônio para fixar · Esc fecha</div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const video = q<HTMLVideoElement>('video');
  const img = q<HTMLImageElement>('img');
  const lang = q('.card-lang');
  const langName = q('.lang-name');
  const live = q('.card-live');
  const title = q('.card-title');
  const desc = q('.card-desc');
  const langBar = q('.lang-bar');
  const langList = q('.lang-list');
  const tags = q('.card-tags');
  const meta = q('.meta-text');
  const link = q<HTMLAnchorElement>('.card-meta a');
  const hint = q('.card-hint');

  let current: Project | null = null;
  let pinned = false;
  let mediaTimer = 0;
  let onClose: (() => void) | null = null;

  function fill(p: Project) {
    const color = languageColor(p.language);
    lang.style.color = color;
    langName.textContent = p.language;
    live.hidden = !p.live;
    title.textContent = p.title;
    desc.textContent = p.description || 'Sem descrição no GitHub.';
    const langs = p.languages.slice(0, 5);
    langBar.innerHTML = langs.map((l) => `<i style="width:${l.pct}%;background:${languageColor(l.name)}"></i>`).join('');
    langList.innerHTML = langs.map((l) => `<span><b>${esc(l.name)}</b> ${l.pct}%</span>`).join('');
    tags.innerHTML = p.tags.length
      ? p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')
      : `<span class="tag" style="opacity:.6">sem tags — adicione <i>topics</i> no repositório</span>`;
    const when = p.pushedAt ? fmtDate.format(new Date(p.pushedAt)) : '';
    meta.textContent = `★ ${p.stars} · ⑂ ${p.forks}${when ? ` · atualizado ${when}` : ''}`;
    link.href = p.url;
  }

  function startMedia(p: Project) {
    clearTimeout(mediaTimer);
    if (p.demoUrl) {
      img.classList.remove('on');
      if (video.getAttribute('src') !== p.demoUrl) video.src = p.demoUrl;
      video.currentTime = 0;
      video.play().catch(() => {});
      video.classList.add('on'); // fade-in esmaecido (CSS)
    } else {
      video.classList.remove('on');
      video.pause();
      if (img.src !== p.coverUrl) {
        img.classList.remove('on');
        img.onload = () => img.classList.add('on');
        img.src = p.coverUrl;
      } else img.classList.add('on');
    }
  }
  function stopMedia() {
    video.classList.remove('on'); // fade-out (CSS)
    img.classList.remove('on');
    clearTimeout(mediaTimer);
    mediaTimer = window.setTimeout(() => {
      if (!current) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }, 700);
  }

  function show(p: Project, pin = false) {
    if (current?.id !== p.id) {
      fill(p);
      startMedia(p);
    }
    current = p;
    if (pin) pinned = true;
    root.classList.add('show');
    root.classList.toggle('pinned', pinned);
    hint.textContent = pinned ? 'Esc ou clique no fundo para soltar' : 'clique no neurônio para fixar';
  }
  function hide(force = false) {
    if (pinned && !force) return;
    pinned = false;
    current = null;
    root.classList.remove('show', 'pinned');
    stopMedia();
  }
  function moveTo(x: number, y: number) {
    if (pinned) return;
    const w = root.offsetWidth || 360;
    const h = root.offsetHeight || 320;
    let left = x + 20;
    let top = y + 20;
    if (left + w > innerWidth - 12) left = x - w - 20;
    if (top + h > innerHeight - 12) top = Math.max(12, innerHeight - h - 12);
    root.style.transform = '';
    root.style.left = `${Math.max(12, left)}px`;
    root.style.top = `${top}px`;
  }

  root.querySelector('.card-close')!.addEventListener('click', () => {
    hide(true);
    onClose?.();
  });

  return { show, hide, moveTo, isPinned: () => pinned, onClose: (cb: () => void) => (onClose = cb) };
}

export type Card = ReturnType<typeof createCard>;
