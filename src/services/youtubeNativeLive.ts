export type YouTubeNativeOverlayPlayer = Record<string, any>;
export type YouTubeNativeOverlayPayload = Record<string, any>;
type ZoomInfo = {zoom: number; minZoom: number; maxZoom: number; source?: string};

export const isYouTubeNativeLiveEngineMounted = () => false;
export const isYouTubeNativePreviewViewAvailable = () => false;
export const isYouTubeNativeLiveReady = () => false;
export const prepareYouTubeNativePreview = async () => ({ok: false});
export const startYouTubeNativeLive = async () => ({ok: false, error: 'disabled'});
export const stopYouTubeNativeLive = async () => undefined;
export const startYouTubeNativeRecord = async (_path: string) => undefined;
export const stopYouTubeNativeRecord = async (): Promise<string | null> => null;
export const updateYouTubeNativeOverlay = async (_payload?: YouTubeNativeOverlayPayload) => undefined;
export const switchYouTubeNativeCamera = async () => undefined;
export const getYouTubeNativeZoomInfo = async (): Promise<ZoomInfo> => ({zoom: 1, minZoom: 1, maxZoom: 1, source: 'disabled'});
export const setYouTubeNativeZoom = async (_level: number) => undefined;
export const subscribeYouTubeNativeLiveState = (_listener: (...args: any[]) => void) => () => undefined;
