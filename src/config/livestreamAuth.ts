export const LIVESTREAM_AUTH_DEV_BASE_URL = '';
export const LIVESTREAM_AUTH_RELEASE_BASE_URL = '';
export const LIVESTREAM_AUTH_BASE_URL = '';

export const APP_OAUTH_SCHEME = 'aplusscore';
export const APP_OAUTH_HOST = 'oauth';
export const APP_OAUTH_PATH = '/callback';
export const APP_OAUTH_CALLBACK_URL = `${APP_OAUTH_SCHEME}://${APP_OAUTH_HOST}${APP_OAUTH_PATH}`;
export const LIVESTREAM_ACCOUNT_STORAGE_KEY = '@livestream_platform_setup_disabled';

export const normalizeLivestreamBaseUrl = (_value: string) => '';
export const isConfiguredLivestreamBaseUrl = (_value: string) => false;
