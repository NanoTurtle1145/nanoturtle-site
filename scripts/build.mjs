#!/usr/bin/env node
/**
 * NanoTurtle 个人门户 · 静态站生成器
 * - 构建时抓取 blog.nanoturtle.cn 的 RSS，渲染"最新文章"
 * - 抓取 GitHub 仓库列表渲染"项目"
 * - 输出 public/，可本地 --serve 预览，--watch 监听内容变更
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const CONTENT = path.join(ROOT, 'content');

const argv = process.argv.slice(2);
const WATCH = argv.includes('--watch');
const SERVE = argv.includes('--serve');
const PORT = Number((argv[argv.indexOf('--port') + 1] || 8080)) || 8080;

const SITE = {
  name: 'NanoTurtle',
  cn: 'NanoTurtle 的小窝',
  tagline: '折腾 Android、Linux 与前端的一名学生',
  blog: 'https://blog.nanoturtle.cn/',
  blogFeed: 'https://blog.nanoturtle.cn/index.php/feed/',
  studio: 'https://www.hopestudio.top/',
  github: 'https://github.com/NanoTurtle1145',
  email: 'guixiabaifo2022@outlook.com',
};

const read = (p) => fs.readFileSync(p, 'utf8');
const ensure = (d) => fs.mkdirSync(d, { recursive: true });
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function getJSON(url, fallback) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'nanoturtle-site-build' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('  ! fetch failed:', url, e.message);
    return fallback;
  }
}

/* ---------------- RSS ---------------- */
function parseRSS(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? t[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
    };
    const title = pick('title');
    const link = pick('link');
    const date = pick('pubDate');
    let desc = pick('description');
    desc = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const cats = [...block.matchAll(/<category><!\[CDATA\[([^\]]+)\]\]><\/category>/g)].map(x => x[1]);
    if (title && link) items.push({ title, link, date, desc, cats });
  }
  return items;
}

async function fetchPosts() {
  try {
    const r = await fetch(SITE.blogFeed, { headers: { 'User-Agent': 'nanoturtle-site-build' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = parseRSS(await r.text());
    if (items.length) {
      fs.writeFileSync(path.join(CONTENT, 'posts.cache.json'), JSON.stringify(items, null, 1));
      console.log(`  posts: ${items.length} from RSS`);
      return items;
    }
  } catch (e) {
    console.warn('  ! RSS failed:', e.message);
  }
  const cache = path.join(CONTENT, 'posts.cache.json');
  if (fs.existsSync(cache)) {
    console.log('  posts: from cache');
    return JSON.parse(read(cache));
  }
  return [];
}

/* ---------------- 项目 ---------------- */
const PROJECT_PICK = [
  { repo: 'h2zbmh-site', title: '杭州二中白马湖学校官网', desc: 'Markdown 驱动的静态站，多语言与存档还原' },
  { repo: 'root-my-s24', title: 'RootMyS24', desc: 'Samsung 设备 root 研究载荷' },
  { repo: 'samsung-root-research', title: 'Samsung Root Research', desc: '三星机型 root 研究与适配资料' },
  { repo: 'OneLineage', title: 'OneLineage', desc: '一加设备 LineageOS 相关工具' },
  { repo: 'WinUINotes', title: 'WinUINotes', desc: 'WinUI 3 学习笔记' },
  { repo: 'BakaSU-S9280', title: 'BakaSU S9280', desc: 'KernelSU 相关移植尝试' },
];

async function fetchProjects() {
  const repos = await getJSON(`https://api.github.com/users/${SITE.github.split('/').pop()}/repos?per_page=100&sort=pushed`, []);
  const byName = new Map((Array.isArray(repos) ? repos : []).map(r => [r.name, r]));
  return PROJECT_PICK.map(p => {
    const r = byName.get(p.repo);
    return {
      title: p.title,
      desc: (r && r.description) || p.desc,
      url: `https://github.com/${SITE.github.split('/').pop()}/${p.repo}`,
      lang: r ? r.language : '',
      stars: r ? r.stargazers_count : 0,
      pushed: r ? r.pushed_at?.slice(0, 10) : '',
    };
  });
}

/* ---------------- 渲染 ---------------- */
const fmtDate = (s) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function renderPosts(posts) {
  if (!posts.length) return '<p class="empty">暂时无法获取博客文章，请稍后访问 <a href="' + SITE.blog + '">博客</a>。</p>';
  return posts.slice(0, 8).map(p => `
    <a class="post" href="${esc(p.link)}" target="_blank" rel="noopener">
      <div class="date">${esc(fmtDate(p.date))}</div>
      <div class="body">
        <h3>${esc(p.title)}</h3>
        ${p.desc ? `<p>${esc(p.desc.slice(0, 110))}</p>` : ''}
      </div>
    </a>`).join('');
}

function renderProjects(list) {
  return list.map(p => `
    <a class="proj" href="${esc(p.url)}" target="_blank" rel="noopener">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.desc)}</p>
      <div class="meta"><span>${esc(p.lang || '')}</span>${p.stars ? `<span>★ ${p.stars}</span>` : ''}</div>
    </a>`).join('');
}

function build({ posts, projects }) {
  ensure(PUBLIC);
  const tpl = read(path.join(ROOT, 'theme', 'index.html'));
  const html = tpl
    .replaceAll('{{NAME}}', esc(SITE.name))
    .replaceAll('{{CN}}', esc(SITE.cn))
    .replaceAll('{{TAGLINE}}', esc(SITE.tagline))
    .replaceAll('{{BLOG}}', esc(SITE.blog))
    .replaceAll('{{STUDIO}}', esc(SITE.studio))
    .replaceAll('{{GITHUB}}', esc(SITE.github))
    .replaceAll('{{EMAIL}}', esc(SITE.email))
    .replaceAll('{{AVATAR}}', esc(SITE.github + '.png'))
    .replaceAll('{{POSTS}}', renderPosts(posts))
    .replaceAll('{{PROJECTS}}', renderProjects(projects))
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
  fs.writeFileSync(path.join(PUBLIC, 'index.html'), html);

  fs.writeFileSync(path.join(PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: https://www.nanoturtle.cn/sitemap.xml\n`);
  fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + `  <url><loc>https://www.nanoturtle.cn/</loc><lastmod>${fmtDate(new Date())}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`
    + `</urlset>\n`);
  console.log(`✓ build → public/  (${posts.length} posts, ${projects.length} projects)`);
}

/* ---------------- serve ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

function serve(port) {
  http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(PUBLIC, p);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1>');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1', () => console.log(`→ http://127.0.0.1:${port}/`));
}

/* ---------------- main ---------------- */
const posts = await fetchPosts();
const projects = await fetchProjects();
build({ posts, projects });

if (WATCH) {
  let t = null;
  const rb = () => { clearTimeout(t); t = setTimeout(async () => { try { build({ posts: await fetchPosts(), projects: await fetchProjects() }); } catch (e) { console.error(e.message); } }, 150); };
  fs.watch(path.join(ROOT, 'theme'), { recursive: true }, rb);
  fs.watch(CONTENT, rb);
  console.log('watching theme/, content/ …');
}
if (SERVE || WATCH) serve(PORT);
