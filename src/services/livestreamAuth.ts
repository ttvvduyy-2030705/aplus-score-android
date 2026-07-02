export type LivestreamPlatform = 'facebook' | 'youtube' | 'tiktok';

export type OAuthCallbackPayload = {
  platform?: LivestreamPlatform;
  status?: 'success' | 'error' | string;
  accountName?: string;
  accountId?: string;
  setupToken?: string;
  errorCode?: string;
  errorMessage?: string;
  rawUrl: string;
};

export const buildPlatformAuthUrl = (_platform: LivestreamPlatform) => {
  throw new Error('Livestream auth đã được tắt trong bản Android offline.');
};

export const openPlatformOAuth = async (_platform: LivestreamPlatform) => undefined;
export const parseOAuthCallback = (_url: string): OAuthCallbackPayload | null => null;
