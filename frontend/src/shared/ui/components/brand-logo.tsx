import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type BrandLogoProps = {
  accessibilityLabel: string;
  size?: 'header' | 'auth' | 'compact';
};

export function BrandLogo({ accessibilityLabel, size = 'header' }: BrandLogoProps) {
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      accessible
      contentFit="contain"
      source={require('../../../../assets/images/cogo-logo.webp')}
      style={[
        styles.logo,
        size === 'auth'
          ? styles.authLogo
          : size === 'compact'
            ? styles.compactLogo
            : styles.headerLogo,
      ]}
    />
  );
}

// Widths derived from the asset's intrinsic ratio (cogo-logo.webp is 497x298,
// ratio ~1.668:1). Pinning width to height * ratio means contentFit="contain"
// has no leftover gutter to centre into, so the visible logo sits flush
// against the box edges instead of floating inside transparent padding.
const LOGO_RATIO = 497 / 298;

const styles = StyleSheet.create({
  logo: {
    flexShrink: 0,
  },
  headerLogo: {
    height: 44,
    width: Math.round(44 * LOGO_RATIO),
  },
  authLogo: {
    height: 112,
    width: Math.round(112 * LOGO_RATIO),
  },
  compactLogo: {
    height: 44,
    width: Math.round(44 * LOGO_RATIO),
  },
});
