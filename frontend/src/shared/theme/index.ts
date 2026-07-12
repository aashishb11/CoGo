import { Platform } from 'react-native';

const cogoGreen = '#7FB738';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardSoft: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  heroCta: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  authCard: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
} as const;

export const FontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  '4xl': 22,
  '5xl': 24,
  '6xl': 28,
  '7xl': 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Typography = {
  caption: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  bodySmall: { fontSize: FontSize.base, fontWeight: FontWeight.medium, lineHeight: 18 },
  body: { fontSize: FontSize.lg, fontWeight: FontWeight.medium, lineHeight: 22 },
  bodyEmphasized: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, lineHeight: 22 },
  titleSmall: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, lineHeight: 22 },
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.extrabold,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  display: {
    fontSize: FontSize['6xl'],
    fontWeight: FontWeight.extrabold,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  brand: {
    fontSize: FontSize['7xl'],
    fontWeight: FontWeight.extrabold,
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  button: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, lineHeight: 22 },
} as const;

export const Palette = {
  background: '#FFFFFF',
  backgroundMuted: '#F3F4F6',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textOnPrimary: '#FFFFFF',
  primary: cogoGreen,
  primarySurface: '#F3F9ED',
  primaryDark: '#365314',
  border: '#E2E8F0',
  danger: '#DC2626',
  dangerSurface: '#FEE2E2',
  // success is aliased to the brand-green family — one green app-wide.
  success: '#365314',
  successSurface: '#F3F9ED',
  warning: '#F59E0B',
  warningSurface: '#FEF3C7',
  info: '#2563EB',
  rankGold: '#D97706',
  rankGoldSurface: '#FEF3C7',
  rankSilver: '#64748B',
  rankSilverSurface: '#F8FAFC',
  rankBronze: '#9A3412',
  rankBronzeSurface: '#FFF7ED',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
