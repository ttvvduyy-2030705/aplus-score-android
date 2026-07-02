import Numeral from 'numeral';

export const numberFormat = (
  number: string | number | undefined = 0,
  format?: string,
) => {
  if (number === null || number === undefined) {
    return '';
  }

  return Numeral(number).format(format);
};

export const numberUnFormat = (formattedNumber: string) => {
  return formattedNumber.split(/[^0-9]/).join('');
};
