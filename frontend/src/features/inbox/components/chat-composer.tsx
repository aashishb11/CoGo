import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

type ChatComposerProps = {
  onSend: (body: string) => Promise<void> | void;
  isSending?: boolean;
};

export function ChatComposer({ onSend, isSending = false }: ChatComposerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !isSending;

  async function handleSend() {
    if (!canSend) {
      return;
    }
    const draft = trimmed;
    setValue('');
    try {
      await onSend(draft);
    } catch {
      // Restore the draft so the user can retry; the parent shows the error.
      setValue(draft);
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
      <View style={[styles.inputWrap, isFocused && styles.inputWrapFocused]}>
        <TextInput
          multiline
          onBlur={() => setIsFocused(false)}
          onChangeText={setValue}
          onFocus={() => setIsFocused(true)}
          placeholder={t('chat.composer.placeholder')}
          placeholderTextColor={Palette.textSecondary}
          style={styles.input}
          value={value}
        />
      </View>

      <Pressable
        accessibilityLabel={t('chat.composer.send')}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={handleSend}
        style={({ pressed }) => [
          styles.sendButton,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
      >
        <Send color={Palette.textOnPrimary} size={20} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Palette.background,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  inputWrapFocused: {
    borderColor: Palette.primary,
    backgroundColor: Palette.background,
  },
  input: {
    maxHeight: 96,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
    padding: 0,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonPressed: {
    opacity: 0.86,
  },
});
