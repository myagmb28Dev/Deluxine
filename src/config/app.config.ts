import { registerAs } from '@nestjs/config';

function parseCorsOrigin(raw: string | undefined) {
  const value = (raw ?? '').trim();
  if (!value) return ['http://localhost:5173'];
  if (value === '*') return '*';

  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : ['http://localhost:5173'];
}

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'Deluxine',
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
}));
