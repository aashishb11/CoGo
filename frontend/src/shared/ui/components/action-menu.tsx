import { MoreVertical } from 'lucide-react-native';
import React, { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomDrawer } from './bottom-drawer';

import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';

export type ActionMenuItem = {
  label: string;
  description?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type ActionMenuProps = {
  actions: ActionMenuItem[];
  /** Optional custom trigger; defaults to a `MoreVertical` icon button. */
  trigger?: ReactNode;
  /** Used by screen-readers when the trigger is the default 3-dot icon. */
  accessibilityLabel?: string;
};

export function ActionMenu({ actions, trigger, accessibilityLabel }: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  function handleOpen(e: { stopPropagation?: () => void }) {
    e.stopPropagation?.();
    setOpen(true);
  }

  const hasRichItems = actions.some((a) => Boolean(a.description));

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={handleOpen}
        style={({ pressed }) => [styles.triggerBtn, pressed && styles.triggerBtnPressed]}
      >
        {trigger ?? <MoreVertical color={Palette.textSecondary} size={18} />}
      </Pressable>

      <BottomDrawer
        accessibilityLabel={accessibilityLabel}
        onClose={() => setOpen(false)}
        visible={open}
      >
        <View style={[styles.actionsList, hasRichItems && styles.actionsListRich]}>
          {actions.map((action, i) => {
            const isLast = i === actions.length - 1;
            return (
              <Pressable
                key={i}
                disabled={action.disabled}
                onPress={() => {
                  setOpen(false);
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.item,
                  !isLast && styles.itemBorder,
                  pressed && !action.disabled && styles.itemPressed,
                  action.disabled && styles.itemDisabled,
                ]}
              >
                {action.icon ? <View style={styles.itemIcon}>{action.icon}</View> : null}
                <View style={styles.itemTextCol}>
                  <Text
                    style={[
                      styles.itemLabel,
                      action.danger && styles.itemLabelDanger,
                      action.disabled && styles.itemLabelDisabled,
                    ]}
                  >
                    {action.label}
                  </Text>
                  {action.description ? (
                    <Text style={styles.itemDescription}>{action.description}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BottomDrawer>
    </>
  );
}

const styles = StyleSheet.create({
  triggerBtn: {
    padding: 4,
    borderRadius: Radii.sm,
  },
  triggerBtnPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  actionsList: {
    overflow: 'hidden',
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.background,
  },
  actionsListRich: {
    backgroundColor: Palette.card,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  itemPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemIcon: {
    width: 18,
    paddingTop: 2,
    alignItems: 'center',
  },
  itemTextCol: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Palette.text,
  },
  itemLabelDanger: {
    color: Palette.danger,
  },
  itemLabelDisabled: {
    color: Palette.textSecondary,
  },
  itemDescription: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
});
