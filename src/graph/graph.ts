import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import { forceRadial } from 'd3-force-3d';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Project } from '../data/projects';
import { languageColor, makeNeuron, makeSynapseDust, type NeuronParts } from './neuron';

export interface BrainNode {
  id: string;
  kind: 'project' | 'dendrite';
  project?: Project;
  parent?: string;
  lang: string;
  color: string;
  radius: number;
  phase: number;
  x?: number;
  y?: number;
  z?: number;
  __threeObj?: THREE.Object3D;
}

export interface BrainLink {
  source: string | BrainNode;
  target: string | BrainNode;
  kind: 'lang' | 'tag' | 'dendrite';
  /** Linguagem (ou tag) que motivou a conexão. */
  key: string;
  color: string;
  speed: number;
}

export interface BrainEvents {
  onHover(project: Project | null): void;
  onSelect(project: Project | null): void;
}

export interface LanguageStat { name: string; color: string; count: number }

// ---------- utilidades determinísticas (mesmo layout inicial a cada visita) ----------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomInSphere(r: number, rand: () => number) {
  const th = 2 * Math.PI * rand();
  const ph = Math.acos(2 * rand() - 1);
  const rr = r * Math.cbrt(rand());
  return { x: rr * Math.sin(ph) * Math.cos(th), y: rr * Math.sin(ph) * Math.sin(th), z: rr * Math.cos(ph) };
}
const idOf = (x: string | BrainNode) => (typeof x === 'string' ? x : x.id);

/** Monta nós (projetos + dendritos decorativos) e ligações (mesma linguagem / tags em comum). */
export function buildGraphData(projects: Project[]) {
  const nodes: BrainNode[] = [];
  const links: BrainLink[] = [];
  const seen = new Set<string>();
  const addLink = (a: string, b: string, kind: BrainLink['kind'], key: string, color: string, speed: number) => {
    const k = [a, b].sort().join('|');
    if (seen.has(k)) return;
    seen.add(k);
    links.push({ source: a, target: b, kind, key, color, speed });
  };

  for (const p of projects) {
    const rand = rng(hash(p.id));
    const color = languageColor(p.language);
    const radius = 4.2 + Math.log1p(p.stars) * 0.9 + (Math.min(p.size, 30000) / 30000) * 1.8;
    const pos = randomInSphere(240, rand);
    nodes.push({ id: p.id, kind: 'project', project: p, lang: p.language, color, radius, phase: rand() * Math.PI * 2, ...pos });
    const dendrites = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < dendrites; i++) {
      const id = `${p.id}::d${i}`;
      const off = randomInSphere(30, rand);
      nodes.push({
        id, kind: 'dendrite', parent: p.id, lang: p.language, color,
        radius: 0.8 + rand() * 0.6, phase: rand() * Math.PI * 2,
        x: pos.x + off.x, y: pos.y + off.y, z: pos.z + off.z,
      });
      addLink(p.id, id, 'dendrite', p.language, color, 0.004 + rand() * 0.004);
    }
  }

  // Projetos da mesma linguagem se conectam (anel + cordas quando o grupo é grande).
  const byLang = new Map<string, Project[]>();
  for (const p of projects) byLang.set(p.language, [...(byLang.get(p.language) ?? []), p]);
  for (const [lang, group] of byLang) {
    const g = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const n = g.length;
    if (n < 2) continue;
    const color = languageColor(lang);
    if (n === 2) addLink(g[0].id, g[1].id, 'lang', lang, color, 0.006);
    else {
      for (let i = 0; i < n; i++) addLink(g[i].id, g[(i + 1) % n].id, 'lang', lang, color, 0.005 + (i % 3) * 0.001);
      if (n >= 5) for (let i = 0; i < Math.floor(n / 2); i++) addLink(g[i].id, g[(i + Math.floor(n / 2)) % n].id, 'lang', lang, color, 0.004);
    }
  }

  // Tags (topics do GitHub) em comum criam sinapses mais fracas entre linguagens diferentes.
  const byTag = new Map<string, Project[]>();
  for (const p of projects) for (const t of p.tags) byTag.set(t, [...(byTag.get(t) ?? []), p]);
  for (const [tag, group] of byTag) {
    if (group.length < 2 || group.length > 12) continue;
    const g = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < g.length - 1; i++) addLink(g[i].id, g[i + 1].id, 'tag', tag, '#9fc3e8', 0.003);
  }

  return { nodes, links };
}

export function createBrain(el: HTMLElement, events: BrainEvents) {
  let data: { nodes: BrainNode[]; links: BrainLink[] } = { nodes: [], links: [] };
  let nodeById = new Map<string, BrainNode>();
  let spread = 0;
  let focusLang: string | null = null;
  let visible = false;
  let active = false;
  let entered = false;
  let autoRotate = true;
  let selected: BrainNode | null = null;
  let autoFitPending = false;
  const hl = { node: null as BrainNode | null, nodes: new Set<string>(), links: new Set<BrainLink>() };

  const graph = new ForceGraph3D(el, { controlType: 'orbit' }) as unknown as ForceGraph3DInstance<BrainNode, BrainLink>;

  const baseDistance = (l: BrainLink) => (l.kind === 'dendrite' ? 16 : l.kind === 'lang' ? 75 : 120);
  const linkVisible = (l: BrainLink) => {
    if (!focusLang) return true;
    const s = nodeById.get(idOf(l.source));
    const t = nodeById.get(idOf(l.target));
    return s?.lang === focusLang || t?.lang === focusLang;
  };

  graph
    .backgroundColor('#03050d')
    .showNavInfo(false)
    .nodeLabel(() => '')
    .nodeThreeObject((n) => makeNeuron(n.color, n.radius, n.kind === 'dendrite'))
    .linkColor((l) => l.color)
    .linkOpacity(0.5)
    .linkWidth((l) => (l.kind === 'dendrite' ? 0.4 : hl.links.has(l) ? 2 : 1))
    .linkCurvature((l) => (l.kind === 'tag' ? 0.3 : l.kind === 'dendrite' ? 0.18 : 0.08))
    .linkDirectionalParticles((l) => (l.kind === 'dendrite' ? 1 : hl.links.has(l) ? 6 : 3))
    .linkDirectionalParticleWidth((l) => (l.kind === 'dendrite' ? 0.9 : hl.links.has(l) ? 2.6 : 1.5))
    .linkDirectionalParticleSpeed((l) => l.speed)
    .linkDirectionalParticleColor((l) => l.color)
    .linkVisibility(linkVisible)
    .onNodeHover((n) => {
      const p = resolveProject(n);
      el.style.cursor = p ? 'pointer' : '';
      if (selected) return; // card fixado: não troca no hover
      setHighlight(p);
      events.onHover(p?.project ?? null);
    })
    .onNodeClick((n) => {
      const p = resolveProject(n);
      if (!p) return;
      selected = p;
      setHighlight(p);
      flyTo(p);
      controls.autoRotate = false;
      events.onSelect(p.project!);
    })
    .onBackgroundClick(() => deselect())
    .onEngineStop(() => {
      // Primeira estabilização depois da entrada: enquadra a rede (se o usuário ainda não mexeu).
      if (autoFitPending) {
        autoFitPending = false;
        fitAll(1400);
      }
    })
    .d3AlphaDecay(0.012)
    .d3VelocityDecay(0.35)
    .cooldownTime(20000)
    .warmupTicks(0);

  // Com poucos projetos a repulsão é suavizada para a rede não se dispersar.
  const chargeScale = () => Math.min(1, 0.25 + data.nodes.filter((n) => n.kind === 'project').length / 40);
  // "Explodir": além da repulsão, os projetos são empurrados para uma casca esférica que cresce com o spread.
  const radial = forceRadial(0, 0, 0, 0).strength(0);
  graph.d3Force('explode', radial);
  function applyForces() {
    graph.d3Force('charge')!.strength((n: BrainNode) => (n.kind === 'dendrite' ? -10 : -170) * chargeScale() * (1 + spread * 4));
    graph.d3Force('link')!.distance((l: BrainLink) => baseDistance(l) * (1 + spread * 1.8));
    // Em repouso, uma casca suave (r≈90) mantém os grupos compactos; explodido, r cresce até ~380.
    radial
      .radius((n: BrainNode) => (n.kind === 'project' ? 90 + spread * 290 : 0))
      .strength((n: BrainNode) => (n.kind === 'project' ? 0.08 + spread * 0.8 : 0));
  }
  applyForces();

  // ---------- renderização ----------
  const renderer = graph.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const composer = graph.postProcessingComposer();
  const bloom = new UnrealBloomPass(new THREE.Vector2(el.clientWidth || innerWidth, el.clientHeight || innerHeight), 0.7, 0.4, 0.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const scene = graph.scene();
  // O clear color do renderer é codificado duas vezes pelo compositor (fundo fica azul-marinho);
  // scene.background passa pelo pipeline de cor certo e sai #03050d de verdade.
  scene.background = new THREE.Color('#03050d');
  scene.fog = new THREE.FogExp2(0x03050d, 0.0011);
  const dust = makeSynapseDust();
  scene.add(dust);

  const controls = graph.controls() as OrbitControls;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 0.45;
  controls.minDistance = 25;
  controls.maxDistance = 1500;
  controls.zoomSpeed = 0.9;
  let idleTimer = 0;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    autoFitPending = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (autoRotate && !selected) controls.autoRotate = true;
    }, 5000);
  });

  graph.pauseAnimation();
  window.addEventListener('resize', () => graph.width(innerWidth).height(innerHeight));

  // ---------- interação ----------
  function resolveProject(n: BrainNode | null): BrainNode | null {
    if (!n) return null;
    if (n.kind === 'project') return n;
    return nodeById.get(n.parent!) ?? null;
  }
  function refreshLinks() {
    graph
      .linkWidth(graph.linkWidth())
      .linkDirectionalParticles(graph.linkDirectionalParticles())
      .linkDirectionalParticleWidth(graph.linkDirectionalParticleWidth());
  }
  function setHighlight(n: BrainNode | null) {
    if (n === hl.node) return;
    hl.node = n;
    hl.nodes.clear();
    hl.links.clear();
    if (n) {
      hl.nodes.add(n.id);
      for (const l of data.links) {
        const s = idOf(l.source);
        const t = idOf(l.target);
        if (s === n.id || t === n.id) {
          hl.links.add(l);
          hl.nodes.add(s);
          hl.nodes.add(t);
        }
      }
    }
    refreshLinks();
  }
  /** Enquadra todos os projetos mantendo a direção atual da câmera. */
  function fitAll(ms = 1000) {
    const pts = data.nodes.filter((n) => n.kind === 'project' && n.x !== undefined);
    if (!pts.length) return;
    const center = new THREE.Vector3();
    for (const n of pts) center.add(new THREE.Vector3(n.x, n.y, n.z));
    center.divideScalar(pts.length);
    let radius = 40;
    for (const n of pts) radius = Math.max(radius, center.distanceTo(new THREE.Vector3(n.x, n.y, n.z)) + n.radius * 8);
    const cam = graph.camera() as THREE.PerspectiveCamera;
    const aspect = Math.max(0.5, cam.aspect);
    const fovV = THREE.MathUtils.degToRad(cam.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const dist = (radius / Math.sin(Math.min(fovV, fovH) / 2)) * 1.15;
    const dir = cam.position.clone().sub(center);
    if (dir.lengthSq() < 1) dir.set(0, 0.2, 1);
    dir.normalize().multiplyScalar(dist);
    const pos = center.clone().add(dir);
    graph.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: center.x, y: center.y, z: center.z }, ms);
  }
  function flyTo(n: BrainNode) {
    const x = n.x ?? 0, y = n.y ?? 0, z = n.z ?? 0;
    const r = Math.hypot(x, y, z) || 1;
    const k = 1 + 70 / r;
    graph.cameraPosition({ x: x * k, y: y * k, z: z * k }, { x, y, z }, 1300);
  }
  function deselect() {
    if (!selected) return;
    selected = null;
    setHighlight(null);
    if (autoRotate) controls.autoRotate = true;
    events.onSelect(null);
  }

  // ---------- vida: pulsação + disparos nervosos ----------
  const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();
    for (const n of data.nodes) {
      const obj = n.__threeObj as THREE.Group | undefined;
      if (!obj) continue;
      const parts = obj.userData as NeuronParts;
      const isD = n.kind === 'dendrite';
      const focused = !focusLang || n.lang === focusLang;
      const lit = hl.node ? hl.nodes.has(n.id) : true;
      const dim = focused && lit ? 1 : 0.4;
      const boost = hl.node && hl.nodes.has(n.id) ? (n === hl.node ? 1.5 : 1.2) : 1;
      const pulse = 1 + (isD ? 0.08 : 0.13) * Math.sin(t * (isD ? 3.1 : 2.1) + n.phase) + (isD ? 0 : 0.04 * Math.sin(t * 5.3 + n.phase * 2));
      const s = parts.base * pulse * boost;
      parts.soma.scale.setScalar(s);
      parts.halo.scale.setScalar(s * (isD ? 5 : 6) * (boost > 1 ? 1.25 : 1));
      (parts.halo.material as THREE.SpriteMaterial).opacity = ((isD ? 0.22 : 0.45) + 0.15 * Math.sin(t * 1.7 + n.phase)) * dim;
      parts.soma.material.emissiveIntensity = ((isD ? 0.8 : 1.5) + 0.5 * Math.sin(t * 2.1 + n.phase)) * dim * (boost > 1 ? 1.4 : 1);
    }
    dust.rotation.y = t * 0.012;
    dust.rotation.x = Math.sin(t * 0.05) * 0.1;
  }
  tick();

  function burst() {
    window.setTimeout(burst, 900 + Math.random() * 1800);
    if (!visible || !data.links.length) return;
    const projects = data.nodes.filter((n) => n.kind === 'project');
    const n = projects[Math.floor(Math.random() * projects.length)];
    if (!n) return;
    data.links
      .filter((l) => idOf(l.source) === n.id || idOf(l.target) === n.id)
      .forEach((l, i) => window.setTimeout(() => graph.emitParticle(l), i * 70));
  }
  burst();

  // ---------- API ----------
  return {
    graph,
    setData(projects: Project[]) {
      data = buildGraphData(projects);
      nodeById = new Map(data.nodes.map((n) => [n.id, n]));
      graph.graphData(data);
      applyForces();
      graph.cameraPosition({ x: 0, y: 0, z: 90 });
    },
    setVisible(v: boolean) {
      if (v === visible) return;
      visible = v;
      if (v) graph.resumeAnimation();
      else graph.pauseAnimation();
    },
    activate() {
      if (active) return;
      active = true;
      el.parentElement!.classList.add('active');
      if (!entered) {
        entered = true;
        // Saindo de dentro das sinapses: a câmera recua e a rede se organiza.
        graph.cameraPosition({ x: 0, y: 0, z: 90 });
        graph.cameraPosition({ x: 0, y: 40, z: 430 }, { x: 0, y: 0, z: 0 }, 3000);
        // Depois do recuo, enquadra a rede (e de novo quando a simulação estabilizar).
        autoFitPending = true;
        window.setTimeout(() => autoFitPending && fitAll(1500), 3400);
      }
      if (autoRotate && !selected) controls.autoRotate = true;
    },
    deactivate() {
      if (!active) return;
      active = false;
      el.parentElement!.classList.remove('active');
      controls.autoRotate = false;
    },
    /** 0 = compacto, 1 = explodido. */
    setSpread(v: number) {
      spread = Math.min(1, Math.max(0, v));
      applyForces();
      graph.d3ReheatSimulation();
    },
    getSpread: () => spread,
    recenter() {
      deselect();
      fitAll(900);
    },
    fit: (ms = 1000) => fitAll(ms),
    setFocusLanguage(lang: string | null) {
      focusLang = lang;
      graph.linkVisibility(graph.linkVisibility());
    },
    getFocusLanguage: () => focusLang,
    setAutoRotate(v: boolean) {
      autoRotate = v;
      controls.autoRotate = v && !selected;
    },
    deselect,
    languages(): LanguageStat[] {
      const m = new Map<string, number>();
      for (const n of data.nodes) if (n.kind === 'project') m.set(n.lang, (m.get(n.lang) ?? 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, color: languageColor(name) }));
    },
  };
}

export type Brain = ReturnType<typeof createBrain>;
