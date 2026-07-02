export const removeSpecificHtmlTag = (
  pattern: RegExp,
  value: string,
  replacement = '',
) => {
  if (!value) {
    return '';
  }

  return String(value).replace(pattern, replacement);
};

export default {
  removeSpecificHtmlTag,
};
