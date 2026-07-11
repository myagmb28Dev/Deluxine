import { expect, test } from 'bun:test';
import { resolveAuthDomain } from './authDomain';

test('uses the Firebase auth domain for localhost', () => {
  expect(resolveAuthDomain('localhost:5173')).toBe(
    'deluxine-97b90.firebaseapp.com',
  );
});

test('uses the Vercel auth proxy for production', () => {
  expect(resolveAuthDomain('deluxineweb.vercel.app')).toBe(
    'deluxineweb.vercel.app',
  );
});
