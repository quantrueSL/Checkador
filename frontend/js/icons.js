import { s } from './util.js';

const PATHS = {
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  alert: ['M12 3l10 18H2z', 'M12 10v5', 'M12 18h.01'],
  payroll: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
  left: ['M15 6l-6 6 6 6'], right: ['M9 6l6 6-6 6'],
  sortUp: ['M7 14l5-5 5 5'], sortDown: ['M7 10l5 5 5-5'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M4 20h16'],
  upload: ['M12 16V5', 'M7 9l5-5 5 5', 'M4 20h16'],
  refresh: ['M20 11a8 8 0 10-2.3 5.7', 'M20 4v7h-7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12l5 5 9-10'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 8h.01'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  eyeOff: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M4 4l16 16'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  hourglass: ['M6 3h12', 'M6 21h12', 'M7 3c0 5 5 6 5 9s-5 4-5 9', 'M17 3c0 5-5 6-5 9s5 4 5 9'],
  plus: ['M12 5v14', 'M5 12h14'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
};

export function icon(name, cls = '') {
  return s('svg', { viewBox: '0 0 24 24', class: `icon ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' },
    ...PATHS[name].map((d) => s('path', { d })));
}
