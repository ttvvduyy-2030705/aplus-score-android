const fonts = {
  Nunito: {
    regular: 'Nunito-Regular',
    bold: 'Nunito-Bold',
    black: 'Nunito-Black',
    italic: 'Nunito-Italic',
  },
};

const getSelectedFont = (
  name: string,
  fontWeight: 'regular' | 'bold' | 'italic' | 'black' = 'regular',
) => {
  switch (name) {
    case 'Nunito-Regular':
      return fonts.Nunito[fontWeight];
    default:
      return fonts.Nunito[fontWeight];
  }
};

export {getSelectedFont};
export default fonts;
