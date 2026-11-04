export const dayColors = {
  blue: '#075BDD', navy: '#071B3F', violet: '#6653C2', aqua: '#61D8EA',
  mint: '#8DDCC4', gold: '#F1C66B', cloud: '#F7FAFF', slate: '#526178',
  white: '#FFFFFF', surface: '#FFFFFF', line: '#E3EBF7',
  blueWash: '#EAF2FF', violetWash: '#F0EDFC', mintWash: '#EAF8F2', goldWash: '#FFF6DE',
  danger: '#B33D4A', errorWash: '#FFF0F1', heroOrbit: '#D8E9FF', disabledIcon: '#9AA6BA',
  actionBlue: '#0866FF', actionViolet: '#6E5DCE', actionNavy: '#071B3F',
  onAction: '#FFFFFF', onActionSecondary: '#DCEAFF', onDarkSecondary: '#D2DDF2',
  rewardPanel: '#071B3F', coinInk: '#071B3F', brandBand: '#1C2B33',
};

export type ThemeColors = typeof dayColors;
export type ThemeMode = 'day' | 'night';
export type ThemePreference = ThemeMode | 'system';

export const nightColors: ThemeColors = {
  blue: '#80B4FF', navy: '#EAF2FF', violet: '#B4A3FF', aqua: '#61D8EA',
  mint: '#8DDCC4', gold: '#F1C66B', cloud: '#0C1426', slate: '#B0BFD5',
  white: '#FFFFFF', surface: '#152238', line: '#2A3B56',
  blueWash: '#132846', violetWash: '#25203F', mintWash: '#14352F', goldWash: '#382E18',
  danger: '#FFABB6', errorWash: '#3F202C', heroOrbit: '#203A5E', disabledIcon: '#71819A',
  actionBlue: '#0866FF', actionViolet: '#6E5DCE', actionNavy: '#25385C',
  onAction: '#FFFFFF', onActionSecondary: '#DCEAFF', onDarkSecondary: '#D2DDF2',
  rewardPanel: '#14233F', coinInk: '#071B3F', brandBand: '#1C2B33',
};


export const careLabels = { feeding: 'Feeding', walk: 'Walk', training: 'Training', sleep: 'Sleep', vet: 'Vet appointment' } as const;
