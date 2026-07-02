import {useCallback, useContext, useMemo} from 'react';
import {LanguageContext} from 'context/language';

const LanguageConfigViewModel = () => {
  const {language, onChangeCurrentLanguage} = useContext(LanguageContext);

  const onChangeLanguage = useCallback(
    (newLanguage: string) => {
      onChangeCurrentLanguage(newLanguage);
    },
    [onChangeCurrentLanguage],
  );

  return useMemo(() => {
    return {language, onChangeLanguage};
  }, [language, onChangeLanguage]);
};

export default LanguageConfigViewModel;
