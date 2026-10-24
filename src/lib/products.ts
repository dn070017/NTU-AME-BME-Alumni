import type { Product } from '../db/schema';
import { badRequest } from './api';

export type ProductInput = Pick<Product, 'name' | 'description' | 'price' | 'imageKey' | 'visible'>;

export async function readProductInput(request: Request): Promise<ProductInput | Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('資料格式錯誤');
  }

  const { name, description, price, imageKey, visible } = body;
  if (typeof name !== 'string' || !name.trim()) return badRequest('請輸入商品名稱');
  if (name.length > 100) return badRequest('商品名稱請勿超過 100 字');
  if (description != null && typeof description !== 'string') return badRequest('商品敘述格式錯誤');
  if (typeof description === 'string' && description.length > 2000) return badRequest('商品敘述請勿超過 2000 字');
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > 1_000_000) {
    return badRequest('價格需為 0 以上的整數');
  }
  if (imageKey != null && (typeof imageKey !== 'string' || !/^products\/[\w-]+\.(webp|jpg|png)$/.test(imageKey))) {
    return badRequest('商品圖片格式錯誤');
  }

  return {
    name: name.trim(),
    description: (description as string | null)?.trim() || null,
    price,
    imageKey: (imageKey as string | null) ?? null,
    visible: visible !== false,
  };
}
