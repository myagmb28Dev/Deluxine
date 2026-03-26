import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from '../../entities/user.entity';
import { FIREBASE_ADMIN } from '../firebase/firebase.module';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(FIREBASE_ADMIN)
    private readonly firebaseAdmin: admin.app.App,
  ) {}

  /**
   * Firebase ID Token을 검증하고 사용자 정보를 반환합니다.
   * 사용자가 DB에 없으면 새로 생성합니다.
   */
  async verifyFirebaseToken(idToken: string) {
    try {
      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(idToken);
      const { uid, email, name, picture } = decodedToken;

      if (!email) {
        throw new UnauthorizedException('Email is required from Firebase token');
      }

      let user = await this.userRepository.findOne({
        where: [{ firebaseUid: uid }, { email: email }],
      });

      if (!user) {
        user = this.userRepository.create({
          firebaseUid: uid,
          email: email,
          displayName: name || null,
          picture: picture || null,
        });
      } else {
        // 기존 사용자의 경우 정보 업데이트
        user.firebaseUid = uid;
        user.displayName = name || user.displayName;
        user.picture = picture || user.picture;
      }

      return await this.userRepository.save(user);
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    return {
      user_id: user.id,
      google_id: user.firebaseUid, // 프론트엔드 MeResponse 규격에 맞춤
      email: user.email,
      display_name: user.displayName,
      first_name: user.firstName,
      last_name: user.lastName,
      picture: user.picture,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    // Firebase에서도 사용자 삭제 (선택 사항)
    try {
      if (user.firebaseUid) {
        await this.firebaseAdmin.auth().deleteUser(user.firebaseUid);
      }
    } catch (e) {
      console.warn('Failed to delete user from Firebase Auth:', e.message);
    }

    await this.userRepository.delete({ id: userId });

    return {
      message: 'user deleted',
      user_id: userId,
      deleted: true,
    };
  }
}
