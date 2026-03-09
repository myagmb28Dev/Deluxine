import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? '',
  tls: process.env.REDIS_TLS === 'true',
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ?? '',
  db: Number(process.env.REDIS_DB ?? 0),
}));
