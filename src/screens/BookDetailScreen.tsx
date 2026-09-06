import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import {
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import BookLoanSection from '@/components/BookLoanSection';
import BookReadingSection from '@/components/BookReadingSection';
import { useBook, useDeleteBook } from '@/hooks/useBooks';
import { getBookCoverUrl } from '@/services/books';

type BookDetailParams = {
  BookDetail: { bookId: string };
};

type BookDetailRoute = RouteProp<BookDetailParams, 'BookDetail'>;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 404
  );
}

function descriptionText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function MetadataRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '') return null;
  return (
    <View style={styles.metadataRow}>
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text style={styles.metadataValue}>{value}</Text>
    </View>
  );
}

export default function BookDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<BookDetailRoute>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const bookId = route.params?.bookId ?? '';
  const { data: book, isPending, isError, error, refetch, isRefetching } = useBook(bookId);
  const deleteBook = useDeleteBook(bookId);
  const [resolvedCover, setResolvedCover] = React.useState<{
    bookId: string;
    url: string | undefined;
  }>();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | undefined>();
  const coverUrl = book && resolvedCover?.bookId === book.id ? resolvedCover.url : undefined;

  React.useEffect(() => {
    if (!book) return;

    let cancelled = false;
    getBookCoverUrl(book).then((url) => {
      if (!cancelled) setResolvedCover({ bookId: book.id, url });
    });
    return () => {
      cancelled = true;
    };
  }, [book]);

  const handleDelete = React.useCallback(async () => {
    if (deleteBook.isPending) return;
    setDeleteError(undefined);
    try {
      await deleteBook.mutateAsync();
      navigation.navigate('Tabs', { screen: 'Library' });
    } catch (mutationError) {
      setDeleteError(mutationErrorMessage(mutationError, t('books.deleteError')));
    }
  }, [deleteBook, navigation, t]);

  if (!bookId) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{t('books.notFound')}</Text>
        <Text style={styles.stateText}>{t('books.noBookId')}</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={styles.state}>
        <ActivityIndicator />
        <Text style={styles.stateText}>{t('books.loadingBook')}</Text>
      </View>
    );
  }

  if (isError || !book) {
    const notFound = isNotFoundError(error);
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{notFound ? t('books.notFound') : t('books.loadError')}</Text>
        <Text style={styles.stateText}>
          {notFound
            ? t('books.removedMessage')
            : error instanceof Error
              ? error.message
              : t('common.connectionRetry')}
        </Text>
        {!notFound && (
          <Pressable
            onPress={() => void refetch()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const ownerDisplay = book.ownerEmail ?? book.owner;
  const description = book.description ? descriptionText(book.description) : undefined;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View style={styles.hero}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText}>{t('books.noCover')}</Text>
          </View>
        )}
        <View style={styles.heading}>
          <Text style={styles.title}>{book.title}</Text>
          {!!book.author && <Text style={styles.author}>{book.author}</Text>}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => navigation.navigate('EditBook', { bookId })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.actionButtonText}>{t('books.edit')}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setDeleteError(undefined);
            setConfirmDelete(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.deleteButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.deleteButtonText}>{t('books.delete')}</Text>
        </Pressable>
      </View>

      {confirmDelete && (
        <View accessibilityRole="alert" style={styles.deleteConfirmation}>
          <Text style={styles.deleteConfirmationTitle}>
            {t('books.deleteConfirmTitle', { title: book.title })}
          </Text>
          <Text style={styles.stateText}>{t('books.deleteConfirmMessage')}</Text>
          {!!deleteError && <Text style={styles.deleteErrorText}>{deleteError}</Text>}
          <View style={styles.confirmationActions}>
            <Pressable
              onPress={() => {
                setConfirmDelete(false);
                setDeleteError(undefined);
              }}
              accessibilityRole="button"
              disabled={deleteBook.isPending}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.buttonPressed,
                deleteBook.isPending && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDelete()}
              accessibilityRole="button"
              disabled={deleteBook.isPending}
              style={({ pressed }) => [
                styles.confirmDeleteButton,
                pressed && styles.buttonPressed,
                deleteBook.isPending && styles.buttonDisabled,
              ]}
            >
              {deleteBook.isPending ? (
                <View style={styles.pendingAction}>
                  <ActivityIndicator />
                  <Text style={styles.confirmDeleteButtonText}>{t('books.deleting')}</Text>
                </View>
              ) : (
                <Text style={styles.confirmDeleteButtonText}>{t('books.deletePermanently')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <BookLoanSection bookId={bookId} />
      <BookReadingSection bookId={bookId} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('books.details')}</Text>
        <MetadataRow label="ISBN-13" value={book.isbn13} />
        <MetadataRow label="ISBN-10" value={book.isbn10} />
        <MetadataRow label={t('books.publisher')} value={book.publisher} />
        <MetadataRow label={t('books.published')} value={book.publishedYear} />
        <MetadataRow label={t('books.location')} value={book.location} />
        <MetadataRow label={t('books.owner')} value={ownerDisplay} />
      </View>

      {!!description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('books.description')}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  stateTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  stateText: { fontSize: 14, color: '#666', textAlign: 'center' },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#222' },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.55 },
  hero: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  cover: { width: 120, height: 180, borderRadius: 8, backgroundColor: '#eee' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { color: '#888', fontSize: 13 },
  heading: { flex: 1, gap: 8, paddingTop: 4 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  author: { fontSize: 18, lineHeight: 24, color: '#555' },
  actions: { flexDirection: 'row', gap: 12 },
  actionButton: { minHeight: 44, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#666' },
  actionButtonText: { fontWeight: '600' },
  deleteButton: { minHeight: 44, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#b00020' },
  deleteButtonText: { color: '#b00020', fontWeight: '600' },
  deleteConfirmation: { maxWidth: 560, gap: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#b00020', borderRadius: 8, backgroundColor: '#fff8f8' },
  deleteConfirmationTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  deleteErrorText: { color: '#b00020', textAlign: 'center' },
  confirmationActions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#777' },
  cancelButtonText: { fontWeight: '600' },
  confirmDeleteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#b00020' },
  confirmDeleteButtonText: { color: '#fff', fontWeight: '700' },
  pendingAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  metadataRow: { flexDirection: 'row', gap: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5' },
  metadataLabel: { width: 88, fontSize: 14, color: '#666' },
  metadataValue: { flex: 1, fontSize: 14 },
  description: { fontSize: 15, lineHeight: 22, color: '#333' },
});
