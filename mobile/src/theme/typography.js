import { Platform } from 'react-native';

const fontFamily = Platform.OS === 'ios' ? 'System' : 'Roboto';

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', fontFamily, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '700', fontFamily, letterSpacing: -0.3 },
  h3: { fontSize: 20, fontWeight: '600', fontFamily },
  h4: { fontSize: 17, fontWeight: '600', fontFamily },
  body: { fontSize: 15, fontWeight: '400', fontFamily },
  bodySmall: { fontSize: 13, fontWeight: '400', fontFamily },
  caption: { fontSize: 11, fontWeight: '400', fontFamily },
  label: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  button: { fontSize: 15, fontWeight: '600', fontFamily },
  tabBar: { fontSize: 10, fontWeight: '500', fontFamily },
};
