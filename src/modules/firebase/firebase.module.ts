import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_ADMIN,
      useFactory: () => {
        const serviceAccountPath = path.join(
          process.cwd(),
          'secrets',
          'firebase-service-account.json',
        );

        // 이미 초기화되어 있는지 확인 (여러 번 초기화 방지)
        if (admin.apps.length === 0) {
          return admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
          });
        }
        return admin.app();
      },
    },
  ],
  exports: [FIREBASE_ADMIN],
})
export class FirebaseModule {}
