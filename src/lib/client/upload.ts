/** 瀏覽器端：壓縮圖片並上傳到 /api/admin/uploads */

export type Uploaded = { key: string; url: string };

/**
 * 依最長邊縮圖並轉成 WebP。GIF 保留原檔（避免失去動畫）。
 * 若轉檔後反而比原檔大且原檔尺寸已在限制內，就沿用原檔。
 */
export async function compressImage(file: File, maxSide: number, quality = 0.82): Promise<Blob> {
  if (file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('圖片轉檔失敗');
  return scale === 1 && blob.size > file.size && file.type === 'image/webp' ? file : blob;
}

/** 相簿照片：一次解碼，同時產生大圖與縮圖 */
export async function photoVariants(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(/heic|heif/i.test(file.type || file.name) ? '瀏覽器無法讀取 HEIC 格式，請先轉為 JPG' : '無法讀取此圖片');
  }
  const render = async (maxSide: number, quality: number) => {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) throw new Error('圖片轉檔失敗');
    return { blob, width: canvas.width, height: canvas.height };
  };
  try {
    const large = await render(2400, 0.82);
    const thumb = await render(600, 0.75);
    return { large, thumb };
  } finally {
    bitmap.close();
  }
}

export async function uploadFile(blob: Blob, folder: string, filename = 'upload'): Promise<Uploaded> {
  const form = new FormData();
  form.append('folder', folder);
  form.append('file', blob, filename);
  const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as Uploaded & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `上傳失敗（${res.status}）`);
  return data as Uploaded;
}

/** 以 XHR 上傳以取得進度（fetch 無法回報上傳進度），適合較大的 PDF */
export function uploadFileWithProgress(file: File, folder: string, onProgress: (ratio: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('folder', folder);
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/uploads');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: Uploaded & { error?: string } = {} as Uploaded;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error ?? `上傳失敗（${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('網路錯誤，上傳失敗'));
    xhr.send(form);
  });
}

export async function uploadImage(file: File, folder: string, maxSide = 1600) {
  return uploadFile(await compressImage(file, maxSide), folder, file.name);
}

/** 呼叫後台 JSON API，錯誤時丟出伺服器回傳的訊息 */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `操作失敗（${res.status}）`);
  return data as T;
}
