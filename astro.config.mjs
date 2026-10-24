// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://ntu-ame-bme-alumni.dn070017.workers.dev', // TODO: 正式網域確定後更新
  output: 'server',
  // 登入交由 Cloudflare Access，不需要 Astro sessions（避免多一個 KV binding）
  session: false,
  adapter: cloudflare({
    // 靜態圖片於 build 時處理；不使用付費的 Cloudflare Images
    imageService: 'compile',
  }),
  integrations: [react()],
});
