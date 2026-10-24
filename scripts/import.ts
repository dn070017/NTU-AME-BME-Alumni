/**
 * 將 assets/initial_data（scripts/scrape.ts 產生）與 assets/商品贊助 匯入 D1 + R2。
 *
 *   pixi run bun scripts/import.ts            # 匯入本地開發環境（.wrangler/state）
 *   pixi run bun scripts/import.ts --remote   # 匯入正式環境（需先 wrangler login 並建立 D1/R2）
 *
 * 以 source_url（商品以名稱）去重，可重複執行；已匯入的項目會略過。
 * 圖片會轉成 WebP：文章內圖片最長邊 1600px、相簿大圖 2400px + 縮圖 600px、商品圖 1200px。
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import * as schema from '../src/db/schema';
import type { Manifest } from './scrape';

const ROOT = path.resolve(import.meta.dir, '..');
const DATA = path.join(ROOT, 'assets/initial_data');
const PRODUCTS_DIR = path.join(ROOT, 'assets/商品贊助');
const REMOTE = process.argv.includes('--remote');

/** 商品圖檔名為「名稱-價格.png」，名稱與敘述在此整理 */
const PRODUCTS: { file: string; name: string; description: string | null }[] = [
  { file: '紀念鑰匙圈_A-45.png', name: '紀念鑰匙圈（A 款）', description: null },
  { file: '紀念鑰匙圈_B-45.png', name: '紀念鑰匙圈（B 款）', description: null },
  { file: '紀念機能襪_白_含紙質禮盒-250.png', name: '紀念機能襪（白）', description: '含紙質禮盒' },
  { file: '紀念機能襪_藍_含紙質禮盒-250.png', name: '紀念機能襪（藍）', description: '含紙質禮盒' },
  { file: '手機架-60.png', name: '手機架', description: null },
];

// ---------- bindings ----------

/** 正式環境：複製 wrangler.jsonc 並將 D1/R2 標記為 remote binding */
async function remoteConfigPath() {
  const raw = await readFile(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
  for (const b of config.d1_databases) b.remote = true;
  for (const b of config.r2_buckets) b.remote = true;
  const out = path.join(ROOT, '.wrangler/import-remote.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(config, null, 2));
  return out;
}

const proxy = await getPlatformProxy<Env>(
  REMOTE ? { configPath: await remoteConfigPath() } : { remoteBindings: false },
);
const db = drizzle(proxy.env.DB, { schema });
const bucket = proxy.env.BUCKET;

// ---------- helpers ----------

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
/** 原站日期以臺灣時間計 */
const taipeiDate = (d: string) => new Date(`${d}T00:00:00+08:00`);
const mediaUrl = (key: string) => `/media/${key}`;

async function put(key: string, body: Buffer | Uint8Array, contentType: string) {
  await bucket.put(key, body, { httpMetadata: { contentType } });
  return key;
}

async function toWebp(input: Buffer | string, maxSide: number, quality = 82) {
  const { data, info } = await sharp(input)
    .rotate() // 依 EXIF 轉正
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function excerptOf(html: string, len = 120) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? (text.length > len ? `${text.slice(0, len)}…` : text) : null;
}

async function exists(table: typeof schema.posts | typeof schema.documents | typeof schema.albums, sourceUrl: string) {
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.sourceUrl, sourceUrl)).limit(1);
  return rows.length > 0;
}

const stats = { added: 0, skipped: 0 };

// ---------- import ----------

async function importPosts(m: Manifest) {
  for (const p of m.posts) {
    if (await exists(schema.posts, p.sourceUrl)) {
      stats.skipped++;
      continue;
    }
    let html = await readFile(path.join(DATA, p.htmlFile), 'utf8');
    const dir = path.dirname(path.join(DATA, p.htmlFile));
    let coverKey: string | null = null;

    for (const img of p.images.filter(Boolean)) {
      const { data } = await toWebp(path.join(dir, 'images', img), 1600);
      const key = await put(`posts/${shortId()}.webp`, data, 'image/webp');
      coverKey ??= key;
      html = html.replaceAll(`src="images/${img}"`, `src="${mediaUrl(key)}"`);
    }

    await db.insert(schema.posts).values({
      type: p.type,
      title: p.title,
      excerpt: excerptOf(html),
      coverKey,
      contentHtml: html,
      publishedAt: taipeiDate(p.publishedAt),
      sourceUrl: p.sourceUrl,
    });
    stats.added++;
    console.log(`  文章：${p.title}`);
  }
}

async function importDocuments(m: Manifest) {
  for (const d of m.documents) {
    if (await exists(schema.documents, d.sourceUrl)) {
      stats.skipped++;
      continue;
    }
    const buf = await readFile(path.join(DATA, d.pdfFile));
    const key = await put(`documents/${shortId()}.pdf`, buf, 'application/pdf');
    await db.insert(schema.documents).values({
      type: d.type,
      title: d.title,
      pdfKey: key,
      pdfSize: buf.byteLength,
      publishedAt: taipeiDate(d.publishedAt),
      sourceUrl: d.sourceUrl,
    });
    stats.added++;
    console.log(`  PDF：${d.title}`);
  }
}

async function importAlbums(m: Manifest) {
  for (const a of m.albums) {
    if (await exists(schema.albums, a.sourceUrl)) {
      stats.skipped++;
      continue;
    }
    const [album] = await db
      .insert(schema.albums)
      .values({ title: a.title, publishedAt: taipeiDate(a.publishedAt), sourceUrl: a.sourceUrl })
      .returning({ id: schema.albums.id });

    let coverPhotoId: number | null = null;
    for (const [i, photo] of a.photos.entries()) {
      const src = path.join(DATA, photo.file);
      const id = shortId();
      const large = await toWebp(src, 2400);
      const thumb = await toWebp(src, 600, 75);
      const key = await put(`albums/${album.id}/${id}.webp`, large.data, 'image/webp');
      const thumbKey = await put(`albums/${album.id}/${id}-thumb.webp`, thumb.data, 'image/webp');
      const [row] = await db
        .insert(schema.photos)
        .values({ albumId: album.id, key, thumbKey, width: large.width, height: large.height, sortOrder: i })
        .returning({ id: schema.photos.id });
      coverPhotoId ??= row.id;
    }
    if (coverPhotoId) {
      await db.update(schema.albums).set({ coverPhotoId }).where(eq(schema.albums.id, album.id));
    }
    stats.added++;
    console.log(`  相簿：${a.title}（${a.photos.length} 張）`);
  }
}

async function importProducts() {
  for (const [i, p] of PRODUCTS.entries()) {
    const found = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.name, p.name)).limit(1);
    if (found.length) {
      stats.skipped++;
      continue;
    }
    const price = Number(p.file.match(/-(\d+)\.\w+$/)?.[1]);
    if (!price) throw new Error(`無法從檔名解析價格：${p.file}`);
    const { data } = await toWebp(path.join(PRODUCTS_DIR, p.file), 1200);
    const imageKey = await put(`products/${shortId()}.webp`, data, 'image/webp');
    await db.insert(schema.products).values({ name: p.name, description: p.description, price, imageKey, sortOrder: i });
    stats.added++;
    console.log(`  商品：${p.name} NT$${price}`);
  }
}

try {
  const manifest: Manifest = JSON.parse(await readFile(path.join(DATA, 'manifest.json'), 'utf8'));
  console.log(`匯入目標：${REMOTE ? '正式環境（remote）' : '本地開發環境'}`);
  await importPosts(manifest);
  await importDocuments(manifest);
  await importAlbums(manifest);
  await importProducts();
  console.log(`完成：新增 ${stats.added} 筆，略過已存在 ${stats.skipped} 筆`);
} finally {
  await proxy.dispose();
}
