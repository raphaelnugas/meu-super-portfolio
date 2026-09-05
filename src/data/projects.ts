import config from '../../portfolio.config.json';

export interface LanguageShare { name: string; pct: number }

export interface Project {
  id: string;
  name: string;
  title: string;
  description: string;
  url: string;
  homepage: string | null;
  language: string;
  languages: LanguageShare[];
  tags: string[];
  stars: number;
  forks: number;
  size: number;
  createdAt: string;
  pushedAt: string;
  demoUrl: string | null;
  coverUrl: string;
  /** Veio direto da API do GitHub (ainda não passou pelo workflow). */
  live?: boolean;
}

export interface Profile {
  login: string;
  name: string;
  headline: string;
  bio: string;
  avatar: string;
  blog: string | null;
  url: string;
}

export interface PortfolioData {
  profile: Profile;
  projects: Project[];
  generatedAt?: string;
}

const BASE = import.meta.env.BASE_URL;

export async function loadProjects(): Promise<PortfolioData> {
  const res = await fetch(`${BASE}data/projects.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('public/data/projects.json não encontrado — rode `npm run sync`.');
  const data: PortfolioData = await res.json();
  try {
    await mergeLive(data);
  } catch {
    /* offline ou rate limit da API: segue com o JSON gerado pelo workflow */
  }
  return data;
}

/**
 * Consulta a API pública do GitHub no navegador para que um repositório
 * recém-criado apareça como neurônio antes mesmo do próximo run do workflow.
 */
async function mergeLive(data: PortfolioData) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  const res = await fetch(
    `https://api.github.com/users/${config.githubUser}/repos?per_page=100&sort=pushed&type=owner`,
    { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } },
  );
  clearTimeout(timer);
  if (!res.ok) return;
  const repos: any[] = await res.json();
  const known = new Set(data.projects.map((p) => p.id.toLowerCase()));
  const excluded = new Set((config.excludeRepos as string[]).map((s) => s.toLowerCase()));
  for (const r of repos) {
    const key = String(r.name).toLowerCase();
    if (known.has(key) || excluded.has(key)) continue;
    if ((r.fork && !config.includeForks) || (r.archived && !config.includeArchived)) continue;
    data.projects.unshift({
      id: r.name,
      name: r.name,
      title: r.name,
      description: r.description ?? '',
      url: r.html_url,
      homepage: r.homepage || null,
      language: r.language ?? 'Outros',
      languages: r.language ? [{ name: r.language, pct: 100 }] : [],
      tags: r.topics ?? [],
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      size: r.size ?? 0,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      demoUrl: null,
      coverUrl: `https://opengraph.githubassets.com/1/${r.full_name}`,
      live: true,
    });
  }
}
