import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from '../../firebase/firebase.module';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase-jwt') {
  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: admin.app.App,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'FIREBASE_AUTH_SECRET_NOT_USED_DIRECTLY', // Passport-jwt 구조상 필요하지만 사용은 안함
    });
  }

  // passport-jwt의 기본 검증 로직을 오버라이드하여 Firebase Admin SDK 사용
  async validate(payload: any, done: (err: any, user: any) => void) {
    // 사실 validate가 호출될 때 이미 passport-jwt가 토큰을 해독해버립니다.
    // 하지만 우리는 Firebase Admin SDK로 '진짜' 검증을 해야 하므로, 
    // 실제로는 요청 객체에서 직접 토큰을 가져와 검증하는 방식을 쓰거나
    // 아래와 같이 authenticate 메소드를 오버라이드하는 것이 좋습니다.
    // 여기서는 간단하게 validate에서 수신된 payload(이미 passport-jwt가 해독한) 대신 
    // 실제 Firebase 검증 로직은 Guard나 별도 로직에서 처리하도록 구성하는 것이 정석입니다.
  }
}
