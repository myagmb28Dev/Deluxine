import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/auth/google/callback',
  feCallbackUrl: process.env.FE_CALLBACK_URL ?? 'http://localhost:5173/auth/callback',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
