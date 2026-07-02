export type CameraSource = 'back' | 'front' | 'external';

type Listener = () => void;

const listeners = new Set<Listener>();

export const emitCycleCameraSource = () => {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.log('[CameraSwitch] listener error:', error);
    }
  });
};

export const subscribeCycleCameraSource = (listener: Listener) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};
