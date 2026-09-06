import React from 'react';
import {
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import BookForm from '@/components/BookForm';
import ScreenState from '@/components/ScreenState';
import { useBook, useUpdateBook } from '@/hooks/useBooks';
import type { BookInput, BookUpdate } from '@/types/domain';

type EditBookParams = {
  EditBook: { bookId: string };
};

type EditBookRoute = RouteProp<EditBookParams, 'EditBook'>;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function EditBookScreen() {
  const { t } = useTranslation();
  const route = useRoute<EditBookRoute>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const bookId = route.params?.bookId ?? '';
  const { data: book, isPending, isError, error, refetch } = useBook(bookId);
  const updateBook = useUpdateBook(bookId);
  const [submitError, setSubmitError] = React.useState<string | undefined>(undefined);

  const handleSubmit = React.useCallback(
    async (values: BookInput | BookUpdate) => {
      setSubmitError(undefined);
      try {
        await updateBook.mutateAsync(values as BookUpdate);
        navigation.goBack();
      } catch (mutationError) {
        setSubmitError(errorMessage(mutationError, t('books.saveError')));
      }
    },
    [navigation, t, updateBook]
  );

  if (!bookId) {
    return <ScreenState title={t('books.notFound')} message={t('books.noBookId')} />;
  }

  if (isPending) {
    return <ScreenState loading message={t('books.loadingBook')} />;
  }

  if (isError || !book) {
    return (
      <ScreenState
        error
        title={t('books.loadError')}
        message={error instanceof Error ? error.message : t('common.connectionRetry')}
        actionLabel={t('common.retry')}
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <BookForm
      heading={t('books.editHeading')}
      help={t('books.editHelp')}
      submitLabel={t('books.saveChanges')}
      pendingLabel={t('common.saving')}
      initialBook={book}
      isPending={updateBook.isPending}
      submitError={submitError}
      onSubmit={handleSubmit}
    />
  );
}
