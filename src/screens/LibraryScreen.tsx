import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AppButton from '@/components/AppButton';
import ScreenState from '@/components/ScreenState';
import { useInfiniteBooks } from '@/hooks/useBooks';
import { getBookCoverUrl } from '@/services/books';
import type { Book } from '@/types/domain';

const SEARCH_DELAY_MS = 300;
const PAGE_SIZE = 30;

function BookRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const { t } = useTranslation();
  const [thumb, setThumb] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    getBookCoverUrl(book, '80x120').then((url) => {
      if (!cancelled) setThumb(url);
    });
    return () => {
      cancelled = true;
    };
  }, [book]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.openBook', { title: book.title })}
      accessibilityHint={t('common.openBookHint')}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        {!!book.author && <Text style={styles.author}>{book.author}</Text>}
        {!!book.location && <Text style={styles.location}>{book.location}</Text>}
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteBooks(search, PAGE_SIZE);

  const books = React.useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const emptyState = React.useMemo(() => {
    if (isPending) {
      return <ScreenState loading message={t('library.loading')} />;
    }

    if (isError) {
      return (
        <ScreenState
          error
          title={t('library.loadErrorTitle')}
          message={error instanceof Error ? error.message : t('common.connectionRetry')}
          actionLabel={t('common.retry')}
          onAction={() => void refetch()}
        />
      );
    }

    return (
      <ScreenState
        title={search ? t('library.noMatchesTitle') : t('library.noBooksTitle')}
        message={search ? t('library.noMatchesMessage') : t('library.noBooksMessage')}
      />
    );
  }, [error, isError, isPending, refetch, search, t]);

  return (
    <FlatList
      data={books}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BookRow
          book={item}
          onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
        />
      )}
      ListHeaderComponent={
        <View style={styles.searchContainer}>
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t('library.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('library.searchAccessibility')}
            accessibilityHint={t('library.searchHint')}
            style={styles.searchInput}
          />
        </View>
      }
      ListEmptyComponent={emptyState}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator accessibilityLabel={t('library.loadingMore')} />
          </View>
        ) : isFetchNextPageError ? (
          <View style={styles.footer} accessibilityRole="alert">
            <Text style={styles.footerText}>{t('library.loadMoreError')}</Text>
            <AppButton
              label={t('common.retry')}
              variant="secondary"
              onPress={() => void fetchNextPage()}
            />
          </View>
        ) : null
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      onRefresh={() => void refetch()}
      refreshing={isRefetching && !isFetchingNextPage}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={books.length === 0 ? styles.emptyContent : undefined}
    />
  );
}

const styles = StyleSheet.create({
  emptyContent: { flexGrow: 1 },
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9ca3af',
    borderRadius: 8,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  rowPressed: { opacity: 0.65 },
  cover: { width: 48, height: 72, borderRadius: 4, backgroundColor: '#eee' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, justifyContent: 'center', gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  author: { fontSize: 14, color: '#4b5563' },
  location: { fontSize: 12, color: '#6b7280' },
  footer: { padding: 20, alignItems: 'center', gap: 10 },
  footerText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
