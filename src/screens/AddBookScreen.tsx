import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AppButton from '@/components/AppButton';
import BookForm from '@/components/BookForm';
import { useCreateBook } from '@/hooks/useBooks';
import { findBooksByIsbn } from '@/services/books';
import { lookupBookMetadata } from '@/services/books/metadata';
import type { Book, BookInput, BookUpdate } from '@/types/domain';

type PocketBaseErrorResponse = {
  message?: unknown;
  data?: Record<string, { message?: unknown }>;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = (error as { response?: PocketBaseErrorResponse }).response;
    if (response?.data) {
      const fieldMessages = Object.entries(response.data)
        .map(([field, value]) =>
          typeof value?.message === 'string' ? `${field}: ${value.message}` : undefined
        )
        .filter((value): value is string => Boolean(value));
      if (fieldMessages.length > 0) return fieldMessages.join('\n');
    }
    if (typeof response?.message === 'string' && response.message) return response.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function AddBookScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const createBook = useCreateBook();
  const [submitError, setSubmitError] = React.useState<string | undefined>(undefined);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = React.useState(false);
  const [duplicateMatches, setDuplicateMatches] = React.useState<Book[]>([]);
  const [pendingValues, setPendingValues] = React.useState<BookInput | undefined>(undefined);
  const [formGeneration, setFormGeneration] = React.useState(0);

  const createAndOpen = React.useCallback(
    async (values: BookInput) => {
      const book = await createBook.mutateAsync(values);
      setSubmitError(undefined);
      setDuplicateMatches([]);
      setPendingValues(undefined);
      setFormGeneration((current) => current + 1);
      navigation.navigate('BookDetail', { bookId: book.id });
    },
    [createBook, navigation]
  );

  const handleSubmit = React.useCallback(
    async (values: BookInput | BookUpdate) => {
      const input = values as BookInput;
      setSubmitError(undefined);

      try {
        const isbn = input.isbn13 ?? input.isbn10;
        if (isbn) {
          setIsCheckingDuplicate(true);
          const matches = await findBooksByIsbn(isbn);
          setIsCheckingDuplicate(false);

          if (matches.length > 0) {
            setPendingValues(input);
            setDuplicateMatches(matches);
            return;
          }
        }

        await createAndOpen(input);
      } catch (error) {
        setIsCheckingDuplicate(false);
        setSubmitError(errorMessage(error, t('books.saveError')));
      }
    },
    [createAndOpen, t]
  );

  const handleOverride = React.useCallback(async () => {
    if (!pendingValues || createBook.isPending) return;
    setSubmitError(undefined);
    try {
      await createAndOpen(pendingValues);
    } catch (error) {
      setSubmitError(errorMessage(error, t('books.saveError')));
    }
  }, [createAndOpen, createBook.isPending, pendingValues, t]);

  const closeDuplicateWarning = React.useCallback(() => {
    if (createBook.isPending) return;
    setDuplicateMatches([]);
    setPendingValues(undefined);
  }, [createBook.isPending]);

  return (
    <>
      <BookForm
        key={formGeneration}
        heading={t('books.addHeading')}
        help={t('books.addHelp')}
        submitLabel={t('books.saveBook')}
        pendingLabel={isCheckingDuplicate ? t('books.checking') : t('common.saving')}
        isPending={createBook.isPending || isCheckingDuplicate}
        submitError={submitError}
        onLookupIsbn={lookupBookMetadata}
        onSubmit={handleSubmit}
      />

      <Modal
        visible={duplicateMatches.length > 0}
        transparent
        animationType="fade"
        onRequestClose={closeDuplicateWarning}
      >
        <View style={styles.backdrop}>
          <View
            style={styles.dialog}
            accessibilityRole="alert"
            accessibilityViewIsModal
            accessibilityLiveRegion="assertive"
          >
            <Text style={styles.dialogTitle}>{t('books.duplicateTitle')}</Text>
            <Text style={styles.dialogText}>
              {t('books.duplicateMessage', { count: duplicateMatches.length })}
            </Text>

            <ScrollView style={styles.matches} contentContainerStyle={styles.matchesContent}>
              {duplicateMatches.map((book) => (
                <View key={book.id} style={styles.matchRow}>
                  <View style={styles.matchText}>
                    <Text style={styles.matchTitle}>{book.title}</Text>
                    {!!book.author && <Text style={styles.matchMeta}>{book.author}</Text>}
                    {!!book.location && (
                      <Text style={styles.matchMeta}>
                        {t('books.locationValue', { location: book.location })}
                      </Text>
                    )}
                  </View>
                  <AppButton
                    label={t('books.viewExisting')}
                    variant="secondary"
                    onPress={() => {
                      closeDuplicateWarning();
                      navigation.navigate('BookDetail', { bookId: book.id });
                    }}
                    style={styles.matchButton}
                  />
                </View>
              ))}
            </ScrollView>

            {!!submitError && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {submitError}
              </Text>
            )}

            <View style={styles.dialogActions}>
              <AppButton
                label={t('books.backToEdit')}
                variant="secondary"
                disabled={createBook.isPending}
                onPress={closeDuplicateWarning}
              />
              <AppButton
                label={t('books.addAnotherCopy')}
                loadingLabel={t('books.adding')}
                loading={createBook.isPending}
                onPress={() => void handleOverride()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '80%',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
    gap: 12,
  },
  dialogTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  dialogText: { fontSize: 15, lineHeight: 21, color: '#4b5563' },
  matches: { maxHeight: 360 },
  matchesContent: { gap: 10 },
  matchRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  matchText: { gap: 3 },
  matchTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  matchMeta: { fontSize: 14, color: '#6b7280' },
  matchButton: { alignSelf: 'flex-start' },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  errorText: { color: '#b00020', fontSize: 13 },
});
