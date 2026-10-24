const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 2026-05-07（臺灣時間），也用於 <input type="date"> 與 <time datetime> */
export const isoDate = (d: Date) => dateFmt.format(d);

/** 2026.05.07 */
export const displayDate = (d: Date) => isoDate(d).replaceAll('-', '.');

/** 將 <input type="date"> 的值視為臺灣時間零時 */
export const parseTaipeiDate = (s: string) => new Date(`${s}T00:00:00+08:00`);

export const mediaUrl = (key: string) => `/media/${key}`;

export const fileSize = (bytes: number | null | undefined) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
