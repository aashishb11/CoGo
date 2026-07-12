import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radii, Spacing, Typography } from '@/shared/theme';

type Props = {
  children: React.ReactNode;
  titleText: string;
  reloadText: string;
};
type State = { error: Error | null };

class ErrorBoundaryImpl extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{this.props.titleText}</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable onPress={this.handleReload} style={styles.button}>
            <Text style={styles.buttonText}>{this.props.reloadText}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <ErrorBoundaryImpl
      reloadText={t('common.errorBoundary.reload')}
      titleText={t('common.errorBoundary.title')}
    >
      {children}
    </ErrorBoundaryImpl>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    backgroundColor: Palette.background,
  },
  title: {
    ...Typography.title,
    marginBottom: Spacing.sm,
    color: Palette.text,
  },
  message: {
    ...Typography.bodySmall,
    color: Palette.textSecondary,
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Palette.primary,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: Radii.sm,
  },
  buttonText: {
    ...Typography.button,
    color: Palette.textOnPrimary,
  },
});
