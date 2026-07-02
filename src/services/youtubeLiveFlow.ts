export type YouTubeEligibilityCheck = {ok?: boolean; enabled?: boolean; reason?: string};
export type YouTubeEligibilityResponse = {eligible?: boolean; checks?: YouTubeEligibilityCheck[]; [key: string]: any};
export type YouTubeCreateLivePayload = Record<string, any>;

export const isYouTubeNotConnectedError = (_error: any) => false;
export const clearStoredYouTubeConnection = async () => undefined;
export const getYouTubeLiveEligibility = async (): Promise<YouTubeEligibilityResponse> => ({eligible: false, checks: []});
export const createYouTubeLiveSession = async (_payload?: YouTubeCreateLivePayload) => {
  throw new Error('YouTube live đã được tắt trong bản Android offline.');
};
export const getYouTubeLiveStatus = async (_broadcastId?: string) => null;
export const stopYouTubeLiveSession = async (_broadcastId?: string) => undefined;
