/**
 * 抓取生機系網站上的系友會既有內容，存到 assets/initial_data 供 scripts/import.ts 匯入。
 *
 *   pixi run bun scripts/scrape.ts
 *
 * 可重複執行：已下載的檔案會略過，manifest.json 每次重建。
 */
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.bime.ntu.edu.tw/';
const OUT = path.resolve(import.meta.dir, '../assets/initial_data');
const UA = 'Mozilla/5.0 (NTU AME-BME Alumni site migration)';

const SOURCES = {
  announcement: 'News_n_202717_sms_130164.html',
  lecture: 'News_n_201406_sms_129202.html',
  interview: 'News_n_172571_sms_105681.html',
  album: 'News_Photo_n_196782_sms_125810.html',
  resource: 'News_n_204391_sms_131437.html',
} as const;

export type ScrapedPost = {
  sourceId: string;
  sourceUrl: string;
  type: 'announcement' | 'interview';
  title: string;
  publishedAt: string; // YYYY-MM-DD
  /** 相對於 initial_data 的路徑 */
  htmlFile: string;
  images: string[];
};
export type ScrapedDocument = {
  sourceId: string;
  sourceUrl: string;
  type: 'lecture' | 'resource';
  title: string;
  publishedAt: string;
  pdfFile: string;
};
export type ScrapedAlbum = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  publishedAt: string;
  photos: { file: string; caption: string }[];
};
export type Manifest = {
  scrapedAt: string;
  posts: ScrapedPost[];
  documents: ScrapedDocument[];
  albums: ScrapedAlbum[];
};

// ---------- helpers ----------

const abs = (href: string) => new URL(href, BASE).toString();
const idFromUrl = (url: string) => url.match(/_s_(\d+)\.html/)?.[1] ?? url.match(/\/(\d+)\/[^/]+$/)?.[1] ?? '';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchRetry(url: string, tries = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i >= tries) throw new Error(`下載失敗 ${url}: ${err}`);
      await Bun.sleep(1000 * i);
    }
  }
}

async function getHtml(url: string) {
  return cheerio.load(await (await fetchRetry(url)).text());
}

/** 下載檔案到 relPath（相對 OUT），已存在則略過 */
async function download(url: string, relPath: string) {
  const dest = path.join(OUT, relPath);
  if (existsSync(dest)) return relPath;
  await mkdir(path.dirname(dest), { recursive: true });
  const buf = await (await fetchRetry(url)).arrayBuffer();
  await writeFile(dest, Buffer.from(buf));
  return relPath;
}

/** 簡易並行限制，避免對來源網站造成負擔 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** 表格式列表頁：回傳 { title, href, date } */
async function parseTableListing(page: string) {
  const $ = await getHtml(abs(page));
  return $('tr')
    .map((_, tr) => {
      const a = $(tr).find('td[data-title="主題"] a').first();
      const date = clean($(tr).find('td[data-title="上版日期"]').text());
      if (!a.length) return null;
      return { title: clean(a.attr('title') || a.text()), href: abs(a.attr('href')!), date };
    })
    .get()
    .filter(Boolean) as { title: string; href: string; date: string }[];
}

// ---------- 文章（公告、訪談） ----------

const EXT_RE = /\.(jpe?g|png|gif|webp)$/i;
const BLOCK_SEL = 'p, div, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table, iframe';

const youtubeId = (url: string) =>
  url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)?.[1];

/** l.facebook.com/l.php?u=... 轉址連結還原成原始網址 */
function unwrapFacebookRedirect(href: string) {
  try {
    const u = new URL(href);
    if (u.hostname === 'l.facebook.com' && u.searchParams.get('u')) return u.searchParams.get('u')!;
  } catch {}
  return href;
}

async function writePost(dir: string, html: string) {
  const htmlFile = `${dir}/content.html`;
  await mkdir(path.join(OUT, dir), { recursive: true });
  await writeFile(path.join(OUT, htmlFile), html);
  return htmlFile;
}

/** 列表項目直接連到 YouTube（例如新聞專訪），以嵌入影片作為文章內容 */
async function youtubePost(item: { title: string; href: string; date: string }, type: ScrapedPost['type'], vid: string) {
  const dir = `posts/yt-${vid}`;
  const htmlFile = await writePost(dir, `<iframe src="https://www.youtube-nocookie.com/embed/${vid}"></iframe>`);
  return { sourceId: `yt-${vid}`, sourceUrl: item.href, type, title: item.title, publishedAt: item.date, htmlFile, images: [] } satisfies ScrapedPost;
}

async function scrapePost(item: { title: string; href: string; date: string }, type: ScrapedPost['type']) {
  const vid = youtubeId(item.href);
  if (vid) return youtubePost(item, type, vid);
  if (new URL(item.href).hostname !== new URL(BASE).hostname) {
    throw new Error(`未支援的外部連結：${item.title} ${item.href}`);
  }

  const sourceId = idFromUrl(item.href);
  const dir = `posts/${sourceId}`;
  const $ = await getHtml(item.href);
  const body = $('.area-essay.page-caption-p .essay .p').first();

  // Facebook 複製過來的 emoji 圖片改回文字
  body.find('img[src*="fbcdn"]').each((_, el) => {
    $(el).replaceWith($(el).attr('alt') || '');
  });

  const images: string[] = [];
  const imgEls = body.find('img').toArray();
  await mapLimit(imgEls, 3, async (el, i) => {
    const src = $(el).attr('src');
    if (!src) return $(el).remove();
    const url = abs(src);
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    const name = `${String(i + 1).padStart(2, '0')}${EXT_RE.test(ext) ? ext : '.jpg'}`;
    await download(url, `${dir}/images/${name}`);
    images[i] = name;
    $(el).attr('src', `images/${name}`);
  });

  body.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')!;
    if (!href.startsWith('javascript:') && !href.startsWith('#')) $(el).attr('href', unwrapFacebookRedirect(abs(href)));
  });

  // 從 Facebook 複製的內容以 <div> 分行：沒有區塊子元素的 div 轉成段落，其餘 div 拆掉外殼
  body.find('div').each((_, el) => {
    const $el = $(el);
    if ($el.find(BLOCK_SEL).length) $el.replaceWith($el.contents());
    else el.tagName = 'p';
  });

  // 移除空段落（原站以 &nbsp; 段落當作空行）；圖片常包在多層 span 內，需檢查所有子孫
  body.find('p').each((_, el) => {
    const $el = $(el);
    if (!clean($el.text().replace(/\u00a0/g, ' ')) && !$el.find('img, iframe').length) $el.remove();
  });

  // 原站以「# 標題」粗體段落當作小標，轉成 <h2>
  body.find('p').each((_, el) => {
    const $el = $(el);
    const text = clean($el.text());
    const boldText = clean($el.find('strong, b').text());
    if (text.startsWith('#') && boldText === text) $el.replaceWith(`<h2>${text.replace(/^#\s*/, '')}</h2>`);
  });

  const html = sanitizeHtml(body.html() || '', {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'hr', 'iframe'],
    allowedAttributes: { a: ['href'], img: ['src', 'alt'], iframe: ['src'] },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
    transformTags: { b: 'strong', i: 'em', h4: 'h3' },
  })
    .replace(/\n{2,}/g, '\n')
    .trim();

  const htmlFile = await writePost(dir, html);

  return { sourceId, sourceUrl: item.href, type, title: item.title, publishedAt: item.date, htmlFile, images } satisfies ScrapedPost;
}

// ---------- PDF（演講、相關資料） ----------

async function scrapeLecture(item: { title: string; href: string; date: string }) {
  const sourceId = idFromUrl(item.href);
  const $ = await getHtml(item.href);
  const pdf =
    $('.page-caption-p iframe[src$=".pdf"]').attr('src') ||
    $('a[href$=".pdf"]').filter((_, a) => !$(a).closest('.base-footer, .base-header').length).first().attr('href');
  if (!pdf) {
    console.warn(`  ! 找不到 PDF，略過：${item.title}`);
    return null;
  }
  const pdfFile = await download(abs(pdf), `documents/lecture-${sourceId}.pdf`);
  return { sourceId, sourceUrl: item.href, type: 'lecture', title: item.title, publishedAt: item.date, pdfFile } satisfies ScrapedDocument;
}

async function scrapeResource(item: { title: string; href: string; date: string }) {
  const sourceId = idFromUrl(item.href);
  const pdfFile = await download(item.href, `documents/resource-${sourceId}.pdf`);
  return { sourceId, sourceUrl: item.href, type: 'resource', title: item.title, publishedAt: item.date, pdfFile } satisfies ScrapedDocument;
}

// ---------- 相簿 ----------

async function scrapeAlbums() {
  const $ = await getHtml(abs(SOURCES.album));
  const items = $('.page-figure a')
    .map((_, a) => ({
      title: clean($(a).find('.figcaption').text() || $(a).attr('title') || ''),
      href: abs($(a).attr('href')!),
      date: clean($(a).find('.mark').first().text()),
    }))
    .get();

  const albums: ScrapedAlbum[] = [];
  for (const item of items) {
    const sourceId = idFromUrl(item.href);
    const $$ = await getHtml(item.href);
    const lis = $$('.list-pic li[data-src]').toArray();
    console.log(`  相簿 ${item.title}：${lis.length} 張`);
    const photos = await mapLimit(lis, 4, async (li, i) => {
      const url = $$(li).attr('data-src')!;
      const caption = clean($$(li).find('img').attr('alt') || '');
      const ext = path.extname(new URL(url).pathname).toLowerCase() || '.jpg';
      const file = await download(url, `albums/${sourceId}/${String(i + 1).padStart(3, '0')}${ext}`);
      return { file, caption };
    });
    albums.push({ sourceId, sourceUrl: item.href, title: item.title, publishedAt: item.date, photos });
  }
  return albums;
}

// ---------- main ----------

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log('活動公告');
  const announcements = await mapLimit(await parseTableListing(SOURCES.announcement), 2, (it) => scrapePost(it, 'announcement'));
  console.log(`  ${announcements.length} 篇`);

  console.log('系友訪談');
  const interviews = await mapLimit(await parseTableListing(SOURCES.interview), 2, (it) => scrapePost(it, 'interview'));
  console.log(`  ${interviews.length} 篇`);

  console.log('系友演講');
  const lectures = (await mapLimit(await parseTableListing(SOURCES.lecture), 2, scrapeLecture)).filter((d) => d !== null);
  console.log(`  ${lectures.length} 份`);

  console.log('相關資料');
  const resources = await mapLimit(await parseTableListing(SOURCES.resource), 2, scrapeResource);
  console.log(`  ${resources.length} 份`);

  console.log('精彩點滴');
  const albums = await scrapeAlbums();

  const manifest: Manifest = {
    scrapedAt: new Date().toISOString(),
    posts: [...announcements, ...interviews],
    documents: [...lectures, ...resources],
    albums,
  };
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`完成，已寫入 ${path.relative(process.cwd(), OUT)}/manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
