#!/usr/bin/env node
/**
 * Sincroniza os repositórios do GitHub com public/data/projects.json.
 *
 * - Lê portfolio.config.json (usuário, exclusões, redes sociais).
 * - Para cada repositório público (e privados, se PORTFOLIO_TOKEN tiver acesso):
 *     linguagens (percentual), topics -> tags, estrelas, datas.
 * - Procura a pasta `.portfolio/` dentro do repositório:
 *     demo.mp4 | demo.webm  -> mini-vídeo do hover
 *     cover.(png|jpg|webp|gif) -> imagem de capa (fallback: OpenGraph do GitHub)
 *     meta.json -> { title, description, tags[], demo, cover, hidden }
 * - Só reescreve o JSON quando algo mudou (para o workflow só commitar quando preciso).
 *
 * Uso: GITHUB_TOKEN=... node scripts/fetch-projects.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'public', 'data', 'projects.json');
const config = JSON.parse(await readFile(path.join(ROOT, 'portfolio.config.json'), 'utf8'));

const TOKEN = process.env.PORTFOLIO_TOKEN || process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'nugas-portfolio-sync',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function gh(url, { allow404 = false } = {}) {
  const res = await fetch(url.startsWith('http') ? url : API + url, { headers });
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} em ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function listRepos(user) {
  const repos = [];
  // Com token do próprio usuário, /user/repos inclui privados; senão, só públicos.
  const base = TOKEN && process.env.PORTFOLIO_TOKEN
    ? `/user/repos?affiliation=owner&per_page=100&sort=pushed`
    : `/users/${user}/repos?per_page=100&sort=pushed&type=owner`;
  for (let page = 1; page < 20; page++) {
    const chunk = await gh(`${base}&page=${page}`);
    repos.push(...chunk);
    if (chunk.length < 100) break;
  }
  return repos;
}

const norm = (s) => String(s || '').toLowerCase();
const excluded = new Set((config.excludeRepos || []).map(norm));

async function portfolioFolder(repo) {
  const files = await gh(`/repos/${repo.full_name}/contents/.portfolio?ref=${repo.default_branch}`, { allow404: true });
  if (!Array.isArray(files)) return {};
  const byName = Object.fromEntries(files.map((f) => [f.name.toLowerCase(), f]));
  const pick = (...names) => names.map((n) => byName[n]).find(Boolean)?.download_url || null;
  const out = {
    demoUrl: pick('demo.mp4', 'demo.webm'),
    coverUrl: pick('cover.png', 'cover.jpg', 'cover.jpeg', 'cover.webp', 'cover.gif'),
    meta: {},
  };
  if (byName['meta.json']) {
    try {
      out.meta = await (await fetch(byName['meta.json'].download_url)).json();
    } catch (e) {
      console.warn(`  ! meta.json inválido em ${repo.name}: ${e.message}`);
    }
  }
  return out;
}

async function buildProject(repo) {
  const langs = (await gh(`/repos/${repo.full_name}/languages`, { allow404: true })) || {};
  const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 1000) / 10 }));
  const { demoUrl, coverUrl, meta = {} } = await portfolioFolder(repo);
  const tags = [...new Set([...(repo.topics || []), ...(meta.tags || [])].map(String))];

  return {
    id: repo.name,
    name: repo.name,
    title: meta.title || repo.name,
    description: meta.description || repo.description || '',
    url: repo.html_url,
    homepage: meta.homepage || repo.homepage || null,
    language: repo.language || languages[0]?.name || 'Outros',
    languages,
    tags,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    size: repo.size,
    private: repo.private,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    defaultBranch: repo.default_branch,
    demoUrl: meta.demo || demoUrl,
    coverUrl: meta.cover || coverUrl || `https://opengraph.githubassets.com/1/${repo.full_name}`,
    hidden: Boolean(meta.hidden),
  };
}

async function main() {
  const user = config.githubUser;
  if (!user || user === 'SEU_USUARIO') throw new Error('Defina githubUser em portfolio.config.json');
  console.log(`Sincronizando repositórios de @${user}${TOKEN ? ' (autenticado)' : ' (sem token)'}...`);

  const [me, repos] = await Promise.all([gh(`/users/${user}`), listRepos(user)]);
  const candidates = repos.filter(
    (r) =>
      r.owner.login.toLowerCase() === user.toLowerCase() &&
      (config.includeForks || !r.fork) &&
      (config.includeArchived || !r.archived) &&
      !excluded.has(norm(r.name)),
  );

  const projects = [];
  for (const repo of candidates) {
    process.stdout.write(`  • ${repo.name}`);
    try {
      const p = await buildProject(repo);
      if (p.hidden) { console.log('  (oculto via meta.json)'); continue; }
      projects.push(p);
      console.log(`  → ${p.language}${p.demoUrl ? ' 🎬' : ''}${p.tags.length ? ' #' + p.tags.join(' #') : ''}`);
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
    }
  }
  projects.sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : -1));

  const data = {
    profile: {
      login: me.login,
      name: me.name || config.name || me.login,
      headline: config.headline || me.bio || '',
      bio: me.bio || '',
      avatar: me.avatar_url,
      blog: me.blog || null,
      url: me.html_url,
      followers: me.followers,
    },
    projects,
  };

  let previous = null;
  try {
    const old = JSON.parse(await readFile(OUT, 'utf8'));
    delete old.generatedAt;
    previous = JSON.stringify(old);
  } catch { /* primeiro run */ }

  if (previous === JSON.stringify(data)) {
    console.log(`Sem mudanças (${projects.length} projetos).`);
    return;
  }
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`Atualizado: ${projects.length} projetos → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
