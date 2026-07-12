import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { formatSignedCents } from '@/features/wallet/format';
import type {
  WalletTransactionDto,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@/features/wallet/types';
import { toLang, type TextKey } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';
import { StatusBadge, type StatusVariant } from '@/shared/ui/components/status-badge';

const TYPE_ICON: Record<WalletTransactionType, LucideIcon> = {
  topup: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  payment: ShoppingBag,
  earning: CircleDollarSign,
};

const TYPE_LABEL_KEY: Record<WalletTransactionType, TextKey> = {
  topup: 'wallet.transactionType.topup',
  withdrawal: 'wallet.transactionType.withdrawal',
  payment: 'wallet.transactionType.payment',
  earning: 'wallet.transactionType.earning',
};

const STATUS_BADGE_VARIANT: Record<WalletTransactionStatus, StatusVariant> = {
  pending: 'pending',
  completed: 'confirmed',
  failed: 'cancelled',
};

const STATUS_LABEL_KEY: Record<WalletTransactionStatus, TextKey> = {
  pending: 'wallet.transactionStatus.pending',
  completed: 'wallet.transactionStatus.completed',
  failed: 'wallet.transactionStatus.failed',
};

type Props = {
  transaction: WalletTransactionDto;
};

export function TransactionRow({ transaction }: Props) {
  const { t, i18n } = useTranslation();
  const lang = toLang(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const Icon = TYPE_ICON[transaction.type] ?? CircleDollarSign;
  const isCredit = transaction.amountCents >= 0;
  const amountText = formatSignedCents(transaction.amountCents, lang);
  const typeLabel = t(TYPE_LABEL_KEY[transaction.type]);
  const statusLabel = t(STATUS_LABEL_KEY[transaction.status]);
  // The backend only attaches a semantically meaningful description on
  // `payment` / `earning` rows (e.g. "Trip Barcelona → Madrid"); for
  // top-up / withdrawal it writes a fixed English label that would leak
  // through the UI. Show description only when it adds context the type
  // label can't carry; otherwise the translated type label is the title.
  const carriesContext = transaction.type === 'payment' || transaction.type === 'earning';
  const description =
    carriesContext && transaction.description?.trim() ? transaction.description.trim() : null;

  return (
    <View style={styles.row}>
      <View
        style={[styles.iconCircle, isCredit ? styles.iconCircleCredit : styles.iconCircleDebit]}
      >
        <Icon color={isCredit ? Palette.success : Palette.text} size={18} strokeWidth={2.2} />
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text numberOfLines={1} style={styles.title}>
            {description ?? typeLabel}
          </Text>
          <Text
            style={[styles.amount, isCredit ? styles.amountCredit : styles.amountDebit]}
            numberOfLines={1}
          >
            {amountText}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={styles.meta}>
            {typeLabel}
          </Text>
          <StatusBadge label={statusLabel} variant={STATUS_BADGE_VARIANT[transaction.status]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleCredit: {
    backgroundColor: Palette.successSurface,
  },
  iconCircleDebit: {
    backgroundColor: Palette.backgroundMuted,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  amount: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  amountCredit: {
    color: Palette.success,
  },
  amountDebit: {
    color: Palette.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
