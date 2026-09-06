import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppButton from '@/components/AppButton';
import { formatNumber, useTranslation } from '@/i18n/core';
import {
  useLendingStatistics,
  useLibraryStatistics,
  useReadingStatistics,
} from '@/hooks/useStatistics';
import type { BreakdownItem } from '@/services/statistics';

function MetricCard({ label, value }: { label: string; value: number }) {
  const formatted = formatNumber(value);
  return (
    <View style={styles.metricCard} accessible accessibilityLabel={`${label}: ${formatted}`}>
      <Text style={styles.metricValue}>{formatted}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatisticsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function SectionLoading({ section }: { section: string }) {
  const { t } = useTranslation();
  const message = t('statistics.loadingSection', { section });
  return (
    <View style={styles.stateRow} accessibilityLiveRegion="polite">
      <ActivityIndicator accessibilityLabel={message} />
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function SectionError({ section, onRetry }: { section: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text style={styles.errorText}>{t('statistics.loadSectionError', { section })}</Text>
      <AppButton label={t('common.retry')} variant="secondary" onPress={onRetry} />
    </View>
  );
}

function LocationBreakdown({ items }: { items: BreakdownItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownTitle}>{t('statistics.booksByLocation')}</Text>
      {items.map((item) => {
        const width = `${Math.max(4, Math.round((item.count / max) * 100))}%` as `${number}%`;
        return (
          <View
            key={item.label.toLocaleLowerCase()}
            style={styles.breakdownRow}
            accessible
            accessibilityLabel={`${item.label}: ${t('common.bookCount', { count: item.count })}`}
          >
            <View style={styles.breakdownLabels}>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownCount}>{formatNumber(item.count)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function StatisticsScreen() {
  const { t } = useTranslation();
  const library = useLibraryStatistics();
  const reading = useReadingStatistics();
  const lending = useLendingStatistics();
  const refreshing = library.isRefetching || reading.isRefetching || lending.isRefetching;

  const refreshAll = React.useCallback(() => {
    void Promise.all([library.refetch(), reading.refetch(), lending.refetch()]);
  }, [lending, library, reading]);

  const libraryTitle = t('navigation.library');
  const readingTitle = t('navigation.myReading');
  const lendingTitle = t('navigation.lending');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshAll}
          accessibilityLabel={t('statistics.refreshing')}
        />
      }
    >
      <Text style={styles.help}>{t('statistics.overviewHelp')}</Text>

      <StatisticsSection title={libraryTitle}>
        {library.data ? (
          <>
            <View style={styles.metrics}>
              <MetricCard label={t('statistics.totalBooks')} value={library.data.totalBooks} />
              <MetricCard label={t('statistics.uniqueAuthors')} value={library.data.uniqueAuthors} />
              <MetricCard label={t('statistics.uniquePublishers')} value={library.data.uniquePublishers} />
              <MetricCard
                label={t('statistics.booksAddedThisYear')}
                value={library.data.booksAddedThisYear}
              />
            </View>
            <LocationBreakdown items={library.data.booksByLocation} />
          </>
        ) : library.isPending ? (
          <SectionLoading section={libraryTitle} />
        ) : (
          <SectionError section={libraryTitle} onRetry={() => void library.refetch()} />
        )}
      </StatisticsSection>

      <StatisticsSection title={readingTitle}>
        {reading.data ? (
          <View style={styles.metrics}>
            <MetricCard label={t('reading.wantToRead')} value={reading.data.wantToRead} />
            <MetricCard label={t('reading.reading')} value={reading.data.reading} />
            <MetricCard label={t('reading.finished')} value={reading.data.finished} />
            <MetricCard label={t('statistics.finishedThisYear')} value={reading.data.finishedThisYear} />
          </View>
        ) : reading.isPending ? (
          <SectionLoading section={readingTitle} />
        ) : (
          <SectionError section={readingTitle} onRetry={() => void reading.refetch()} />
        )}
      </StatisticsSection>

      <StatisticsSection title={lendingTitle}>
        {lending.data ? (
          <View style={styles.metrics}>
            <MetricCard
              label={t('statistics.currentlyLentOut')}
              value={lending.data.currentlyLentOut}
            />
            <MetricCard label={t('statistics.overdue')} value={lending.data.overdueActiveLoans} />
            <MetricCard label={t('statistics.returned')} value={lending.data.returnedLoans} />
            <MetricCard
              label={t('statistics.loansMadeThisYear')}
              value={lending.data.loansMadeThisYear}
            />
          </View>
        ) : lending.isPending ? (
          <SectionLoading section={lendingTitle} />
        ) : (
          <SectionError section={lendingTitle} onRetry={() => void lending.refetch()} />
        )}
      </StatisticsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 48,
    gap: 28,
  },
  help: { fontSize: 15, lineHeight: 22, color: '#4b5563' },
  section: { gap: 14 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    gap: 4,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  metricValue: { fontSize: 25, fontWeight: '700', color: '#111827' },
  metricLabel: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  stateRow: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  errorBox: { alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  errorText: { fontSize: 14, color: '#b00020' },
  breakdown: { gap: 10, marginTop: 4 },
  breakdownTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  breakdownRow: { gap: 5 },
  breakdownLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  breakdownLabel: { flex: 1, fontSize: 14, color: '#374151' },
  breakdownCount: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
  barTrack: { height: 7, overflow: 'hidden', borderRadius: 999, backgroundColor: '#e5e7eb' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: '#1f6feb' },
});
