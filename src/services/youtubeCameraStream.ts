export type YouTubeNativeCameraConfig = Record<string, any>;
export type YouTubeNativeZoomInfo = {zoom: number; minZoom: number; maxZoom: number; source?: string};

let currentConfig: YouTubeNativeCameraConfig | null = null;
export const configureYouTubeNativeCamera = async (config?: YouTubeNativeCameraConfig) => { currentConfig = config || null; };
export const clearYouTubeNativeCamera = async () => { currentConfig = null; };
export const startYouTubeNativeStream = async () => undefined;
export const stopYouTubeNativeStream = async () => undefined;
export const startYouTubeNativeRecord = async (_path: string) => undefined;
export const stopYouTubeNativeRecord = async () => null;
export const setYouTubeNativeZoom = async (_zoom: number) => undefined;
export const getYouTubeNativeZoomInfo = async (): Promise<YouTubeNativeZoomInfo> => ({zoom: 1, minZoom: 1, maxZoom: 1, source: 'disabled'});
export const isYouTubeNativeCameraEnabled = () => false;
export const getYouTubeNativeCameraConfig = () => currentConfig;
export const addYouTubeCameraStreamListener = (_eventName: string, _listener: (...args: any[]) => void) => ({remove: () => undefined});
