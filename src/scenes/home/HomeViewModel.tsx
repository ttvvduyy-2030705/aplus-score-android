import {useCallback, useContext, useMemo} from 'react';
import {LanguageContext} from 'context/language';

import i18n from 'i18n';

import {screens} from 'scenes/screens';

import {Navigation} from 'types/navigation';

export interface Props extends Navigation {}

const HomeViewModel = (props: Props) => {
  const {language} = useContext(LanguageContext);

  const onStartNewGame = useCallback(() => {
    props.navigate(screens.gameSettings);
  }, [props]);

  const onPressHistory = useCallback(() => {
    props.navigate(screens.history);
  }, [props]);

  const onPressConfigs = useCallback(() => {
    props.navigate(screens.configs);
  }, [props]);

  const helloText = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();

    switch (true) {
      case hours >= 0 && hours <= 11:
        return i18n.t('txtGoodMorning');
      case hours > 11 && hours <= 17:
        return i18n.t('txtGoodAfternoon');
      case hours > 17 && hours <= 23:
        return i18n.t('txtGoodEvening');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return useMemo(() => {
    return {
      language,
      helloText,
      onStartNewGame,
      onPressHistory,
      onPressConfigs,
    };
  }, [language, helloText, onStartNewGame, onPressHistory, onPressConfigs]);
};

export default HomeViewModel;
