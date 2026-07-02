import SoundPlayer from 'react-native-sound-player';
import Tts from 'react-native-tts';

const playShortSoundFile = (name: string, type: string, logName: string) => {
  try {
    SoundPlayer.playSoundFile(name, type);
  } catch (error) {
    console.log(`Cannot play ${logName}`, error);
  }
};

const stopShortSound = (logName: string) => {
  try {
    SoundPlayer.stop();
  } catch (error) {
    console.log(`Cannot stop ${logName}`, error);
  }
};

const Sound = {
  timeout: () => {
    playShortSoundFile('timeout', 'm4a', 'timeout');
  },
  beep: () => {
    playShortSoundFile('beep', 'wav', 'beep');
  },
  countdownBeep: () => {
    playShortSoundFile('beep', 'wav', 'countdown beep');
  },
  stopCountdownBeep: () => {
    stopShortSound('countdown beep');
  },
  speak: (utterance: string) => {
    Tts.speak(utterance);
  },
};

export default Sound;
