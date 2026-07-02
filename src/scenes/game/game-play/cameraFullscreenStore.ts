type Listener = (value: boolean) => void;

let fullscreen = false;
const listeners = new Set<Listener>();

export const getCameraFullscreen = () => fullscreen;

export const setCameraFullscreen = (value: boolean) => {
  if (fullscreen === value) {
    return;
  }

  fullscreen = value;
  listeners.forEach(listener => listener(fullscreen));
};

export const subscribeCameraFullscreen = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
