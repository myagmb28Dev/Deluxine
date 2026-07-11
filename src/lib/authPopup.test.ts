import { expect, test } from 'bun:test';
import { shouldFallbackToRedirect } from './authPopup';

test('falls back when the browser blocks the popup', () => {
  expect(shouldFallbackToRedirect({ code: 'auth/popup-blocked' })).toBe(true);
});

test('falls back when popup auth is unsupported', () => {
  expect(
    shouldFallbackToRedirect({
      code: 'auth/operation-not-supported-in-this-environment',
    }),
  ).toBe(true);
});

test('does not redirect when the user closes the popup', () => {
  expect(shouldFallbackToRedirect({ code: 'auth/popup-closed-by-user' })).toBe(
    false,
  );
});
