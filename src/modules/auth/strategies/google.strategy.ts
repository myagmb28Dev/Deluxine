import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { GoogleAuthUser } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.googleClientId') ?? '',
      clientSecret: configService.get<string>('auth.googleClientSecret') ?? '',
      callbackURL: configService.get<string>('auth.googleCallbackUrl') ?? '',
      scope: ['email', 'profile'],
    });
  }

  authorizationParams(): { access_type: string; prompt: string } {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }

  validate(accessToken: string, refreshToken: string, profile: Profile): GoogleAuthUser {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException('google profile email not found');
    }

    return {
      provider: profile.provider,
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      picture: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
      rawProfile: profile._json,
    };
  }
}
