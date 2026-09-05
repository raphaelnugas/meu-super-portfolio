# Meu Super Portfólio — a rede neural dos meus projetos

Portfólio 3D de **Raphael Nugas**. A página abre com o meu retrato; ao rolar, a câmera gira
360° e mergulha no cérebro até virar uma rede de sinapses, que se transforma numa **rede neural
3D interativa** onde **cada neurônio é um repositório do GitHub**.

- Passe o mouse num neurônio → card com linguagem, tags, estrelas e um **mini‑vídeo esmaecido**
  (fade‑in ao entrar, fade‑out ao sair). Clique → a câmera aproxima e o card fica fixo.
- Projetos da **mesma linguagem se conectam**; tags (topics) em comum criam sinapses mais fracas.
- O ambiente fica vivo: pulsação dos neurônios, partículas correndo pelas sinapses, disparos aleatórios.
- Arraste para girar, roda do mouse para aproximar/afastar, **Explodir / Expandir** para abrir a rede.
- Rodapé com LinkedIn, GitHub, site e e‑mail (configurável).
- **Automático:** um workflow do GitHub Actions lê os seus repositórios e reconstrói o site. Subiu um
  repositório novo → nasce um neurônio novo. Enquanto o workflow não roda, o próprio site consulta a
  API pública do GitHub e mostra o repositório novo marcado como "novo".

## Rodar localmente

```bash
npm install
npm run sync     # gera public/data/projects.json a partir do GitHub
npm run dev      # http://localhost:5173
```

`npm run build` gera a pasta `dist/` (site estático).

## Estrutura

```
index.html                     palco: abertura (canvas) + rede 3D + HUD + card + rodapé
src/main.ts                    liga scroll → abertura → crossfade → cérebro ativo
src/intro/intro.ts             quadros do vídeo desenhados conforme o scroll, botão "Assistir"
src/graph/graph.ts             3d-force-graph: neurônios, sinapses, bloom, pulsos, explodir, foco
src/graph/neuron.ts            cores por linguagem, geometria/halo do neurônio, poeira sináptica
src/ui/card.ts                 card de prévia (vídeo/capa esmaecidos, linguagens, tags)
src/ui/hud.ts                  botões, slider, legenda por linguagem, status da sincronização
src/ui/footer.ts               redes sociais
src/data/projects.ts           carrega projects.json + mescla repositórios novos via API
scripts/fetch-projects.mjs     sincroniza GitHub → public/data/projects.json
public/media/frames/           120 quadros WebP extraídos de "Nugas Video.mp4" (12 fps)
portfolio.config.json          usuário do GitHub, exclusões, redes sociais
.github/workflows/             sync + deploy no GitHub Pages
templates/notify-portfolio.yml workflow para colocar nos outros repositórios (aviso instantâneo)
```

## Configuração

`portfolio.config.json`:

| campo | o que faz |
|---|---|
| `githubUser` | de quem buscar os repositórios |
| `includeForks` / `includeArchived` | incluir forks / arquivados (padrão: não) |
| `excludeRepos` | nomes de repositórios que nunca viram neurônio |
| `socials[]` | links do rodapé; entradas com `url` vazia são ignoradas. Ícones: `linkedin`, `github`, `instagram`, `x`, `youtube`, `site`, `email` |

> Confira a URL do LinkedIn — ela foi preenchida como palpite.

### Metadados por repositório (opcional)

Crie a pasta `.portfolio/` dentro de qualquer repositório:

| arquivo | uso |
|---|---|
| `demo.mp4` ou `demo.webm` | mini‑vídeo do hover (curto, mudo, ≤ 5 MB fica leve) |
| `cover.png` / `.jpg` / `.webp` / `.gif` | capa quando não há vídeo (padrão: imagem OpenGraph do GitHub) |
| `meta.json` | `title`, `description`, `tags[]`, `demo`, `cover`, `homepage`, `hidden` — veja `.portfolio-example/meta.json` |

As **tags** também vêm dos *topics* do repositório (Settings → Topics no GitHub); a linguagem vem
das estatísticas do GitHub (linguagem principal + percentuais).

## Domínio próprio

O site oficial é **https://www.nugas.com.br** (servido de uma VPS com nginx + Traefik, fora deste repositório;
um cron faz o deploy sempre que a `main` muda). O GitHub Pages abaixo continua como espelho.

## Publicar no GitHub Pages

1. Crie o repositório (sugestão: `meu-super-portfolio`; se chamar `raphaelnugas.github.io` o site
   fica na raiz do domínio) e envie este projeto:
   ```bash
   git init && git add -A && git commit -m "feat: portfólio neural" && git branch -M main
   git remote add origin https://github.com/raphaelnugas/meu-super-portfolio.git && git push -u origin main
   ```
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. O workflow `Sync projects & deploy` roda a cada push, **a cada 6 horas** e manualmente
   (Actions → Run workflow). Ele:
   - busca os repositórios (`npm run sync`), commita `public/data/projects.json` se mudou;
   - faz o build com o `base` certo (`/<nome-do-repo>/`) e publica no Pages.
4. (Opcional) Repositórios **privados**: crie um PAT com escopo `repo` e salve como secret
   `PORTFOLIO_TOKEN` no repositório do portfólio.
5. (Opcional) **Aviso instantâneo**: copie `templates/notify-portfolio.yml` para
   `.github/workflows/` dos outros repositórios e crie o secret `PORTFOLIO_DISPATCH_TOKEN`
   (fine‑grained PAT com *Contents: read & write* só no repositório do portfólio). Ajuste o nome
   do repositório na URL se não for `meu-super-portfolio`.

## Trocar o vídeo de abertura

```bash
ffmpeg -i "novo-video.mp4" -vf "fps=12,scale=1280:-2" -c:v libwebp -q:v 80 public/media/frames/f_%03d.webp
```

Se o número de quadros mudar, ajuste `FRAMES` em `src/main.ts`. O último quadro deve ser a imagem
das sinapses — é ele que se dissolve na rede 3D.

## Ajustes finos

- `src/main.ts`: `VIDEO_END`, `FADE_START`, `FADE_END` controlam onde o vídeo termina e onde começa
  o crossfade; `#scroller { height: 600vh }` no CSS define quanto scroll dura a abertura.
- `src/graph/graph.ts`: forças (`-170` repulsão, distâncias 16/75/120), bloom (`0.7, 0.4, 0.35`),
  velocidade das partículas, tempo de estabilização.
- `src/graph/neuron.ts`: paleta de cores por linguagem.
