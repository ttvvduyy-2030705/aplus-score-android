import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

const LEGACY_LOGO_STORAGE_KEYS = [
  'ShowThumbnailOnLiveStream',
  'ThumbnailsTopLeft',
  'ThumbnailsTopRight',
  'ThumbnailsBottomLeft',
  'ThumbnailsBottomRight',
  'sponsorLogo',
  'sponsor_logo',
  'sponsorLogoUrl',
  'sponsorLogoURL',
  'logoUrl',
  'logoURL',
  'watermarkUrl',
  'watermarkURL',
  'thumbnailUrl',
  'thumbnailURL',
  'cameraLogo',
  'cameraLogoUrl',
  'overlayLogo',
  'overlayLogoUrl',
  'ipCameraLogo',
  'ipCameraLogoUrl',
  'streamLogo',
  'streamLogoUrl',
  'brandLogo',
  'brandLogoUrl',
  'imageOverlay',
  'imageOverlayUrl',
];

const LEGACY_THUMBNAIL_DIR = `${RNFS.DocumentDirectoryPath}/thumbnail-overlays`;
let cleanupPromise: Promise<void> | null = null;

const logRemovedKey = (key: string) => {
  console.log(`[LogoCleanup] removedKey=${key}`);
};

export const getLegacyLogoStorageKeys = () => [...LEGACY_LOGO_STORAGE_KEYS];

export const cleanupLegacyLogoStorage = async (): Promise<void> => {
  if (cleanupPromise) {
    return cleanupPromise;
  }

  cleanupPromise = (async () => {
    try {
      const existing = await AsyncStorage.multiGet(LEGACY_LOGO_STORAGE_KEYS);
      const keysToRemove = existing
        .filter(([, value]) => value != null)
        .map(([key]) => key);

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        keysToRemove.forEach(logRemovedKey);
      }
    } catch (error) {
      console.log('[LogoCleanup] asyncStorageCleanupFailed', error);
    }

    try {
      const exists = await RNFS.exists(LEGACY_THUMBNAIL_DIR);
      if (exists) {
        await RNFS.unlink(LEGACY_THUMBNAIL_DIR);
        console.log(`[LogoCleanup] removedDir=${LEGACY_THUMBNAIL_DIR}`);
      }
    } catch (error) {
      console.log('[LogoCleanup] thumbnailDirCleanupFailed', error);
    }

    console.log('[LogoCleanup] legacyLogoIgnored=true');
  })();

  return cleanupPromise;
};

export const ignoreLegacyLogoField = <T>(value: T): undefined => {
  if (value !== undefined && value !== null && value !== '') {
    console.log('[LogoCleanup] ignoredLegacyLogoField=true');
  }
  return undefined;
};

export default cleanupLegacyLogoStorage;
