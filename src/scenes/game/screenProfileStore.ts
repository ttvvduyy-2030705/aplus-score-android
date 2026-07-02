import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScreenProfile = 'auto' | 'compact7' | 'tablet12' | 'display24';

type Listener = (profile: ScreenProfile) => void;

const STORAGE_KEY = '@APLUS_SCREEN_PROFILE_V1';
const VALID_PROFILES: ScreenProfile[] = ['auto', 'compact7', 'tablet12', 'display24'];

let currentProfile: ScreenProfile = 'auto';
let hydrated = false;
const listeners = new Set<Listener>();

const isValidProfile = (value: unknown): value is ScreenProfile =>
  VALID_PROFILES.includes(value as ScreenProfile);

const notify = () => {
  listeners.forEach(listener => listener(currentProfile));
};

export const getScreenProfile = (): ScreenProfile => currentProfile;

export const hydrateScreenProfile = async (): Promise<ScreenProfile> => {
  if (hydrated) {
    return currentProfile;
  }

  hydrated = true;

  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (isValidProfile(saved)) {
      currentProfile = saved;
      notify();
    }
  } catch (error) {
    console.log('[Screen Profile] Failed to load profile:', error);
  }

  return currentProfile;
};

export const setScreenProfile = async (nextProfile: ScreenProfile) => {
  if (!isValidProfile(nextProfile) || nextProfile === currentProfile) {
    return;
  }

  currentProfile = nextProfile;
  notify();

  try {
    await AsyncStorage.setItem(STORAGE_KEY, nextProfile);
  } catch (error) {
    console.log('[Screen Profile] Failed to save profile:', error);
  }
};

export const subscribeScreenProfile = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
