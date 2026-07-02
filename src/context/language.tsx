import {LANGUAGES} from 'i18n';
import React from 'react';

export const LanguageContext = React.createContext({
  language: LANGUAGES[0],
  onChangeCurrentLanguage: (_language: string) => {},
});
