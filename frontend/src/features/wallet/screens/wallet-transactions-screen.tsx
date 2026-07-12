import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { TransactionRow } from '@/features/wallet/components/transaction-row';
import { useWalletTransactions } from '@/features/wallet/queries';
import type { WalletTransactionDto } from '@/features/wallet/types';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

export default function WalletTransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;

  const query = useWalletTransactions(userId);
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  // Flatten all loaded pages so FlatList can virtualize the combined list.
  const items = useMemo<WalletTransactionDto[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  const isInitialLoading = session.isPending || (userId !== null && query.isLoading);
  const errorMessage = query.error ? t(mapErrorToMessageKey(query.error)) : '';

  const fetchNextPage = query.fetchNextPage;
  const hasNextPage = query.hasNextPage;
  const isFetchingNextPage = query.isFetchingNextPage;
  const refetch = query.refetch;

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handlePullToRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    try {
      await refetch();
    } finally {
      setIsManualRefresh(false);
    }
  }, [refetch]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/wallet');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('viewProfile.back'),
        }}
        subtitle={t('wallet.transactions.subtitle')}
        title={t('wallet.transactions.title')}
      />

      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={[styles.statusCard, styles.loadingRow]}>
              <ActivityIndicator color={Palette.primary} size="small" />
              <Text style={styles.loadingText}>{t('wallet.transactions.loading')}</Text>
            </View>
          ) : errorMessage ? (
            <View style={[styles.statusCard, styles.errorCard]}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.emptyText}>{t('wallet.transactions.empty')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={Palette.primary} size="small" />
            </View>
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            colors={[Palette.primary]}
            onRefresh={handlePullToRefresh}
            refreshing={isManualRefresh}
            tintColor={Palette.primary}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <TransactionRow transaction={item} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  rowWrap: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.md,
    ...Shadow.cardSoft,
  },
  separator: {
    height: Spacing.sm,
  },
  statusCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 70,
  },
  loadingText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  errorCard: {
    borderColor: Palette.danger,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.base,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
