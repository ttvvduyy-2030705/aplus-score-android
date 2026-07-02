export type LivePlatform = 'youtube' | 'facebook';

export type YouTubeCreateLivePayload = {
  title: string;
  description?: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
  scheduledStartTime?: string;
  enableAutoStart?: boolean;
  enableAutoStop?: boolean;
  enableDvr?: boolean;
  recordFromStart?: boolean;
  resolution?: string;
  frameRate?: string;
  latencyPreference?: 'normal' | 'low' | 'ultraLow';
  enableLowLatency?: boolean;
};

export type FacebookPage = {
  id: string;
  name: string;
  category?: string;
  picture?: string;
  tasks?: string[];
};

export type FacebookCreateLivePayload = {
  title: string;
  description?: string;
  targetType?: 'page' | 'user';
  targetId?: string;
};

const disabled = async () => {
  throw new Error('Livestream đã được tắt trong bản Android offline.');
};

export const getLiveConnections = async () => ({youtube: null, facebook: null});
export const getFacebookPages = async (): Promise<FacebookPage[]> => [];
export const createYouTubeLive = async (_payload: YouTubeCreateLivePayload) => disabled();
export const getYouTubeLiveStatus = async (_broadcastId: string) => null;
export const stopYouTubeLive = async (_broadcastId: string) => undefined;
export const createFacebookLive = async (_payload: FacebookCreateLivePayload) => disabled();
export const getFacebookLiveStatus = async (_liveVideoId: string) => null;
export const stopFacebookLive = async (_liveVideoId: string) => undefined;
