export const burnLivestreamOverlaysIntoVideo = async (videoPath?: string) => {
  if (!videoPath) {
    return undefined;
  }

  console.log('[ReplayOverlay] rollback mode: skip burn and keep original video');
  return videoPath;
};
