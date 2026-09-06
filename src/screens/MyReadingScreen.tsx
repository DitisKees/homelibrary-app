import React from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import ScreenState from '@/components/ScreenState';
import { formatDate, formatNumber } from '@/i18n';
import { useMyReadingStatuses } from '@/hooks/useReadingStatus';
import type { ReadingStatusEntry } from '@/services/readingStatus';
import type { ReadingStatusValue } from '@/types/domain';

const STATUS_ORDER: ReadingStatusValue[] = ['reading', 'want_to_read', 'finished'];

function statusKey(status: ReadingStatusValue): 'reading.reading' | 'reading.wantToRead' | 'reading.finished' {
  if (status === 'want_to_read') return 'reading.wantToRead';
  if (status === 'finished') return 'reading.finished';
  return 'reading.reading';
}

function ReadingRow({ entry, onPress }: { entry: ReadingStatusEntry; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const book = entry.bookDetails;
  if (!book) return null;

  const dateText =
    entry.status === 'finished'
      ? formatDate(entry.finishedAt, i18n.resolvedLanguage)
      : entry.status === 'reading'
        ? formatDate(entry.startedAt, i18n.resolvedLanguage)
        : undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.openBook', { title: book.title })}
      accessibilityHint={t('common.openBookHint')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.title}>{book.title}</Text>
        {!!book.author && <Text style={styles.author}>{book.author}</Text>}
        {!!dateText && (
          <Text style={styles.dateText}>
            {entry.status === 'finished'
              ? t('reading.finishedDate', { date: dateText })
              : t('reading.startedDate', { date: dateText })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function MyReadingScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { data = [], isPending, isError, error, refetch, isRefetching } = useMyReadingStatuses();

  const sections = React.useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        title: t(statusKey(status)),
        status,
        data: data.filter((entry) => entry.status === status && entry.bookDetails),
      })).filter((section) => section.data.length > 0),
    [data, t]
  );

  if (isPending) {
    return <ScreenState loading message={t('reading.loadingList')} />;
  }

  if (isError) {
    return (
      <ScreenState
        error
        title={t('reading.loadListError')}
        message={error instanceof Error ? error.message : t('common.connectionRetry')}
        actionLabel={t('common.retry')}
        onAction={() => void refetch()}
      />
    );
  }

  if (sections.length === 0) {
    return (
      <ScreenState
        title={t('reading.emptyTitle')}
        message={t('reading.emptyMessage')}
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
          <Text
            style={styles.sectionCount}
            accessibilityLabel={t('common.bookCount', { count: section.data.length })}
          >
            {formatNumber(section.data.length, i18n.resolvedLanguage)}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <ReadingRow
          entry={item}
          onPress={() => navigation.navigate('BookDetail', { bookId: item.book })}
        />
      )}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  pressed: { opacity: 0.7 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 8,
    backgroundColor: '#f7f7f7',
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
  sectionCount: { fontSize: 14, color: '#6b7280' },
  row: {
    minHeight: 76,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  rowText: { gap: 3 },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  author: { fontSize: 14, color: '#4b5563' },
  dateText: { fontSize: 12, color: '#6b7280' },
});
