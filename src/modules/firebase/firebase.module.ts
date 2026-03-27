import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

function normalizeBase64(input: string) {
  const trimmed = input.trim();
  // Support URL-safe base64 as well.
  let normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) normalized += '='.repeat(4 - pad);
  return normalized;
}

function loadServiceAccountFromEnv(): admin.ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as admin.ServiceAccount;
    return parsed;
  } catch (e) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be valid JSON)');
  }
}

function loadServiceAccountFromEnvBase64(): admin.ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(normalizeBase64(raw), 'base64').toString('utf8');
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON_B64 (must be base64)');
  }

  try {
    return JSON.parse(decoded) as admin.ServiceAccount;
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON_B64 (decoded value must be JSON)');
  }
}

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_ADMIN,
      useFactory: () => {
        const envServiceAccount = loadServiceAccountFromEnvBase64() ?? loadServiceAccountFromEnv();
        if (!envServiceAccount) {
          throw new Error(
            'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON_B64 (preferred) or FIREBASE_SERVICE_ACCOUNT_JSON.',
          );
        }

        // 이미 초기화되어 있는지 확인 (여러 번 초기화 방지)
        if (admin.apps.length === 0) {
          return admin.initializeApp({
            credential: admin.credential.cert(envServiceAccount),
          });
        }
        return admin.app();
      },
    },
  ],
  exports: [FIREBASE_ADMIN],
})
export class FirebaseModule {}
