import * as THREE from 'three';

/** Cores por linguagem (fallback: matiz derivada do nome). */
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3b82f6',
  JavaScript: '#facc15',
  Python: '#4ade80',
  Rust: '#fb923c',
  Go: '#22d3ee',
  Java: '#f87171',
  'C#': '#a78bfa',
  'C++': '#60a5fa',
  C: '#94a3b8',
  HTML: '#f97316',
  CSS: '#c084fc',
  Shell: '#a3e635',
  PowerShell: '#38bdf8',
  Dart: '#38bdf8',
  Kotlin: '#e879f9',
  Swift: '#fb7185',
  PHP: '#818cf8',
  Ruby: '#ef4444',
  'Jupyter Notebook': '#fbbf24',
  Vue: '#34d399',
  Svelte: '#fb7185',
  Lua: '#93c5fd',
  Dockerfile: '#38bdf8',
  Outros: '#7dd3fc',
};

export function languageColor(lang: string): string {
  if (LANG_COLORS[lang]) return LANG_COLORS[lang];
  let h = 0;
  for (const ch of lang) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 85% 68%)`;
}

let haloTex: THREE.Texture | null = null;
/** Textura radial (brilho suave) usada nos halos e nas partículas de fundo. */
export function haloTexture(): THREE.Texture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

const sphereGeo = new THREE.SphereGeometry(1, 28, 28);

export interface NeuronParts {
  soma: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  halo: THREE.Sprite;
  base: number;
  dendrite: boolean;
}

/** Corpo celular (esfera emissiva) + halo aditivo. */
export function makeNeuron(color: string, radius: number, dendrite = false): THREE.Group {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const soma = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: dendrite ? 0.9 : 1.6,
      roughness: 0.4,
      metalness: 0.05,
    }),
  );
  soma.scale.setScalar(radius);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture(),
      color: col,
      transparent: true,
      opacity: dendrite ? 0.25 : 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(radius * (dendrite ? 5 : 6));
  g.add(soma, halo);
  const parts: NeuronParts = { soma, halo, base: radius, dendrite };
  g.userData = parts;
  return g;
}

/** "Poeira sináptica": partículas aditivas ao fundo para o ambiente parecer vivo. */
export function makeSynapseDust(count = 2200, radius = 650): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const th = 2 * Math.PI * u;
    const ph = Math.acos(2 * v - 1);
    const r = radius * (0.25 + 0.75 * Math.cbrt(Math.random()));
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 3.5,
    map: haloTexture(),
    color: 0x5fb0ff,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.raycast = () => {}; // decorativo: não pode "roubar" o hover dos neurônios
  return points;
}
