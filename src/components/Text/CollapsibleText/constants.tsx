import fonts from 'configuration/fonts';

const getMinDescHeight = (screenHeight: number) => screenHeight * 0.3;
const SYSTEM_HTML_FONTS = [fonts.Nunito.regular];

export { getMinDescHeight, SYSTEM_HTML_FONTS };
