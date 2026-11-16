// The look plan, in one place. Dusk desert: sand and concrete under a burnt sky,
// teal for Vanguard, amber for the Jackals. The same names are the CSS custom
// properties in index.html. No other colour appears in the game.
export const PALETTE = {
  sky: '#4a3826',
  fog: '#3a2c1e',
  ground: '#a9855a',
  groundDark: '#8a6b45',
  concrete: '#7d7468',
  concreteDark: '#5d564c',
  steel: '#3a3630',
  crate: '#9a7a4e',
  accent: '#35c4b5', // Vanguard teal
  enemy: '#e8a13a', // Jackal amber
  ink: '#f2ede4',
  muted: '#b3a58d',
  danger: '#d84a3a',
  leaf: '#6d7a4a',
};

export function shade(name) {
  return PALETTE[name];
}
