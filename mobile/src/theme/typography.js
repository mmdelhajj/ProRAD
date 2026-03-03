import { Platform } from 'react-native';

const fontFamily = Platform.OS === 'ios' ? 'System' : 'Roboto';

export const typography = {
  h1: { fontSize: 26, fontWeight: '700', fontFamily, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: '700', fontFamily, letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: '600', fontFamily },
  h4: { fontSize: 16, fontWeight: '600', fontFamily },
  body: { fontSize: 15, fontWeight: '400', fontFamily },
  bodySmall: { fontSize: 13, fontWeight: '400', fontFamily },
  caption: { fontSize: 12, fontWeight: '400', fontFamily },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  button: { fontSize: 15, fontWeight: '600', fontFamily },
  tabBar: { fontSize: 11, fontWeight: '500', fontFamily },
};
