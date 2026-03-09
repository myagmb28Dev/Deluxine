export interface GoogleAuthUser {
  provider: string;
  googleId: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  rawProfile?: Record<string, unknown>;
}
