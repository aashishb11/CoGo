import { useTranslation } from 'react-i18next';

import type { PayoutStatus } from '@/features/wallet/types';
import type { TextKey } from '@/shared/i18n';
import { StatusBadge, type StatusVariant } from '@/shared/ui/components/status-badge';

const VARIANT: Record<PayoutStatus, StatusVariant> = {
  none: 'archived',
  pending: 'pending',
  active: 'confirmed',
  restricted: 'cancelled',
};

const LABEL_KEY: Record<PayoutStatus, TextKey> = {
  none: 'wallet.payout.status.none',
  pending: 'wallet.payout.status.pending',
  active: 'wallet.payout.status.active',
  restricted: 'wallet.payout.status.restricted',
};

type Props = {
  status: PayoutStatus;
};

export function PayoutStatusPill({ status }: Props) {
  const { t } = useTranslation();
  return <StatusBadge label={t(LABEL_KEY[status])} variant={VARIANT[status]} />;
}
