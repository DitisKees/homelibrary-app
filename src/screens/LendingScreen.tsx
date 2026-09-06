import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type NavigationProp, type ParamListBase, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AppButton from '@/components/AppButton';
import ScreenState from '@/components/ScreenState';
import { useLoans, useMarkLoanReturned } from '@/hooks/useLoans';
import { formatDate } from '@/i18n';
import type { LoanEntry } from '@/services/loans';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function LoanCard({
  loan,
  active,
  returning,
  onOpenBook,
  onReturn,
}: {
  loan: LoanEntry;
  active: boolean;
  returning: boolean;
  onOpenBook: () => void;
  onReturn?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const title = loan.bookDetails?.title ?? t('common.book');
  const lentDate = formatDate(loan.dateLent, i18n.resolvedLanguage);
  const dueDate = formatDate(loan.dateDue, i18n.resolvedLanguage);
  const returnedDate = formatDate(loan.dateReturned, i18n.resolvedLanguage);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpenBook}
        accessibilityRole="button"
        accessibilityLabel={t('common.openBook', { title })}
        accessibilityHint={t('common.openBookHint')}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.bookTitle}>{title}</Text>
        {!!loan.bookDetails?.author && <Text style={styles.author}>{loan.bookDetails.author}</Text>}
      </Pressable>
      <Text style={styles.borrower}>{t('lending.borrower', { name: loan.borrowerName })}</Text>
      {!!lentDate && <Text style={styles.meta}>{t('lending.lent', { date: lentDate })}</Text>}
      {!!dueDate && <Text style={styles.meta}>{t('lending.due', { date: dueDate })}</Text>}
      {!!returnedDate && <Text style={styles.meta}>{t('lending.returned', { date: returnedDate })}</Text>}
      {!!loan.borrowerContact && <Text style={styles.meta}>{t('lending.contact', { contact: loan.borrowerContact })}</Text>}
      {!!loan.notes && <Text style={styles.notes}>{loan.notes}</Text>}
      {active && onReturn && (
        <AppButton
          label={t('lending.markReturned')}
          loadingLabel={t('lending.markingReturned')}
          loading={returning}
          onPress={onReturn}
          style={styles.returnButton}
        />
      )}
    </View>
  );
}

export default function LendingScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { data = [], isPending, isError, error, refetch, isRefetching } = useLoans();
  const markReturned = useMarkLoanReturned();
  const [returnError, setReturnError] = React.useState<string | undefined>();
  const [returningId, setReturningId] = React.useState<string | undefined>();

  const activeLoans = React.useMemo(() => data.filter((loan) => !loan.dateReturned), [data]);
  const history = React.useMemo(() => data.filter((loan) => !!loan.dateReturned), [data]);

  const handleReturn = React.useCallback(
    async (loan: LoanEntry) => {
      if (markReturned.isPending) return;
      setReturnError(undefined);
      setReturningId(loan.id);
      try {
        await markReturned.mutateAsync(loan.id);
      } catch (mutationError) {
        setReturnError(errorMessage(mutationError, t('lending.returnError')));
      } finally {
        setReturningId(undefined);
      }
    },
    [markReturned, t]
  );

  if (isPending) {
    return <ScreenState loading message={t('lending.loadingLoans')} />;
  }

  if (isError) {
    return (
      <ScreenState
        error
        title={t('lending.loadError')}
        message={error instanceof Error ? error.message : t('common.connectionRetry')}
        actionLabel={t('common.retry')}
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          {t('lending.title')}
        </Text>
        <Text style={styles.subtitle}>{t('lending.subtitle')}</Text>
      </View>

      {!!returnError && (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {returnError}
        </Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('lending.activeLoans')}
        </Text>
        {activeLoans.length === 0 ? (
          <Text style={styles.emptyText}>{t('lending.noActiveLoans')}</Text>
        ) : (
          activeLoans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              active
              returning={returningId === loan.id}
              onOpenBook={() => navigation.navigate('BookDetail', { bookId: loan.book })}
              onReturn={() => void handleReturn(loan)}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('lending.history')}
        </Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>{t('lending.noHistory')}</Text>
        ) : (
          history.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              active={false}
              returning={false}
              onOpenBook={() => navigation.navigate('BookDetail', { bookId: loan.book })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 40,
    gap: 28,
  },
  heading: { gap: 6 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 15, color: '#6b7280' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptyText: { color: '#6b7280' },
  card: {
    gap: 6,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  bookTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  author: { fontSize: 14, color: '#4b5563', marginTop: 2 },
  borrower: { fontSize: 15, fontWeight: '600', marginTop: 4, color: '#1f2937' },
  meta: { fontSize: 13, color: '#6b7280' },
  notes: { fontSize: 14, lineHeight: 20, color: '#374151', marginTop: 4 },
  returnButton: { alignSelf: 'flex-start', marginTop: 4 },
  errorText: { color: '#b00020' },
  pressed: { opacity: 0.75 },
});
