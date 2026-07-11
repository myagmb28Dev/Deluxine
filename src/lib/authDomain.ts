const AUTH_DOMAIN = 'deluxineweb.vercel.app';
const FIREBASE_AUTH_DOMAIN = 'deluxine-97b90.firebaseapp.com';

export const resolveAuthDomain = (host?: string) => {
  if (host?.startsWith('localhost:') || host?.startsWith('127.0.0.1:')) {
    return FIREBASE_AUTH_DOMAIN;
  }

  return AUTH_DOMAIN;
};
