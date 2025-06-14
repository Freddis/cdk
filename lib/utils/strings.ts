export const uppercaseFirst = (val: string): string => {
  return `${val.charAt(0).toLocaleUpperCase()}${val.slice(1)}`;
};
