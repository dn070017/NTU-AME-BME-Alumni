import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// 檔案實體存在 R2，資料表只存 R2 object key（例如 `posts/12/abc.webp`）
// 時間欄位以 unix 毫秒存放；published_at 是前台顯示的「上版日期」，created_at 是實際建立時間

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

/** 活動公告、系友訪談：Tiptap 編輯的文章 */
export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // TODO(技術債): enum 目前只是 TypeScript 型別，D1 欄位是一般 TEXT，資料庫層並未限制可填的值
    // （寫入時由 src/lib/posts.ts 的 isPostType 驗證）。之後應改為資料庫層的有限值，例如加上
    // CHECK (type IN (...))；SQLite 無法直接對既有欄位加 CHECK，需重建資料表的 migration。
    // 另外「最新消息」與「活動公告」未來可能合併成同一個前台頁面，屆時 type 可能改為分類標籤
    // （例如 category），調整時一併考慮。單元設定見 src/lib/sections.ts。
    type: text('type', { enum: ['announcement', 'news', 'interview'] }).notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    coverKey: text('cover_key'),
    contentHtml: text('content_html').notNull().default(''),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
    /** 匯入來源網址，用於重複匯入時去重 */
    sourceUrl: text('source_url').unique(),
    ...timestamps,
  },
  (t) => [index('posts_type_published_idx').on(t.type, t.publishedAt)],
);

/** 系友演講、相關資料：一份 PDF + 標題 */
export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['lecture', 'resource'] }).notNull(),
    title: text('title').notNull(),
    pdfKey: text('pdf_key').notNull(),
    pdfSize: integer('pdf_size'),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
    sourceUrl: text('source_url').unique(),
    ...timestamps,
  },
  (t) => [index('documents_type_published_idx').on(t.type, t.publishedAt)],
);

/** 精彩點滴：相簿 */
export const albums = sqliteTable(
  'albums',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    /** 封面照片；未指定時前台取第一張 */
    coverPhotoId: integer('cover_photo_id'),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
    sourceUrl: text('source_url').unique(),
    ...timestamps,
  },
  (t) => [index('albums_published_idx').on(t.publishedAt)],
);

export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    /** 瀏覽用大圖（最長邊約 2400px） */
    key: text('key').notNull(),
    /** 格狀瀏覽用縮圖（最長邊約 600px） */
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('photos_album_idx').on(t.albumId, t.sortOrder)],
);

/** 商品贊助 */
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  /** 新台幣，整數 */
  price: integer('price').notNull(),
  imageKey: text('image_key'),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

export type Post = typeof posts.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Product = typeof products.$inferSelect;
