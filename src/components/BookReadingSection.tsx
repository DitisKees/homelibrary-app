import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useReadingStatus,
  useRemoveReadingStatus,
  useSetReadingStatus,
} from '@/hooks/useReadingStatus';
import { formatDate } from '@/i18n';
import type { ReadingStatusValue } from '@/types/domain';

const STATUS_OPTIONS: ReadingStatusValue[] = ['want_to_read', 'reading', 'finished'];

function statusKey(status: ReadingStatusValue): 'reading.wantToRead' | 'reading.reading' | 'reading.finished' {
  if (status === 'want_to_read') return 'reading.wantToRead';
  if (status === 'finished') return 'reading.finished';
  return 'reading.reading';
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function BookReadingSection({ bookId }: { bookId: string }) {
  const { t, i18n } = useTranslation();
  const {
    data: readingStatus,
    isPending,
    isError,
    error,
    refetch,
  } = useReadingStatus(bookId);
  const setReadingStatus = useSetReadingStatus(bookId);
  const removeReadingStatus = useRemoveReadingStatus(bookId);
  const [readingError, setReadingError] = React.useState<string | undefined>();
  const busy = setReadingStatus.isPending || removeReadingStatus.isPending;

  const handleStatus = React.useCallback(
    async (status: ReadingStatusValue) => {
      if (busy) return;
      setReadingError(undefined);
      try {
        await setReadingStatus.mutateAsync(status);
      } catch (mutationError) {
        setReadingError(errorMessage(mutationError, t('reading.updateError')));
      }
    },
    [busy, setReadingStatus, t]
  );

  const handleRemove = React.useCallback(async () => {
    if (busy) return;
    setReadingError(undefined);
    try {
      await removeReadingStatus.mutateAsync();
    } catch (mutationError) {
      setReadingError(errorMessage(mutationError, t('reading.removeError')));
    }
  }, [busy, removeReadingStatus, t]);

  const started = formatDate(readingStatus?.startedAt, i18n.resolvedLanguage);
  const finished = formatDate(readingStatus?.finishedAt, i18n.resolvedLanguage);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('reading.sectionTitle')}</Text>
      {isPending ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.secondaryText}>{t('reading.loadingStatus')}</Text>
        </View>
      ) : isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : t('reading.loadStatusError')}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.actions}>
            {STATUS_OPTIONS.map((status) => {
              const selected = readingStatus?.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => void handleStatus(status)}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.statusButton,
                    selected && styles.selectedButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Text style={[styles.statusText, selected && styles.selectedText]}>
                    {t(statusKey(status))}
                  </Text>
                </Pressable>
              );
            })}
            {!!readingStatus && (
              <Pressable
                onPress={() => void handleRemove()}
                accessibilityRole="button"
                disabled={busy}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={styles.removeText}>{t('common.remove')}</Text>
              </Pressable>
            )}
          </View>
          {!!started && <Text style={styles.secondaryText}>{t('reading.startedDate', { date: started })}</Text>}
          {!!finished && <Text style={styles.secondaryText}>{t('reading.finishedDate', { date: finished })}</Text>}
          {!!readingError && <Text style={styles.errorText}>{readingError}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryText: { fontSize: 13, color: '#666' },
  errorBox: { alignItems: 'flex-start', gap: 10 },
  errorText: { color: '#b00020' },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#777' },
  retryButtonText: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: '#777' },
  selectedButton: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  statusText: { fontWeight: '600' },
  selectedText: { color: '#fff' },
  removeButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999 },
  removeText: { color: '#b00020', fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
});