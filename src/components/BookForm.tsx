import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import BarcodeScannerButton from '@/components/BarcodeScannerButton';
import type { Book, BookInput, BookUpdate } from '@/types/domain';
import type { BookMetadata } from '@/services/books/metadata';
import { MetadataLookupError } from '@/services/books/metadataErrors';
import { isbnKind, isValidIsbn, normalizeIsbn } from '@/utils/isbn';

type FieldErrors = Partial<
  Record<'title' | 'author' | 'isbn' | 'publisher' | 'publishedYear' | 'location' | 'description', string>
>;

type BookFormValues = BookInput | BookUpdate;

type BookFormProps = {
  heading: string;
  help: string;
  submitLabel: string;
  pendingLabel: string;
  initialBook?: Book;
  isPending: boolean;
  submitError?: string;
  onLookupIsbn?: (isbn: string) => Promise<BookMetadata | null>;
  onSubmit: (values: BookFormValues) => Promise<void>;
};

const MAX_TEXT_LENGTH = 500;
const MAX_COVER_WIDTH = 1200;

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function coverErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof Error && error.message) return error.message;
  return t('books.form.prepareCoverError');
}

function lookupErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof MetadataLookupError) {
    return t(`books.metadataErrors.${error.code}`, { provider: error.provider });
  }
  if (error instanceof Error && error.message) return error.message;
  return t('books.form.lookupError');
}

function isbnValidationMessage(normalizedIsbn: string, t: TFunction): string | undefined {
  if (!normalizedIsbn) return t('books.form.isbnRequiredForLookup');
  if (isValidIsbn(normalizedIsbn)) return undefined;
  if (/^\d{13}$/.test(normalizedIsbn) || /^\d{9}[\dX]$/.test(normalizedIsbn)) {
    return t('books.form.isbnInvalidChecksum');
  }
  return t('books.form.isbnInvalid');
}

async function prepareCover(uri: string): Promise<{ upload: Blob; previewUri: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_COVER_WIDTH, height: null });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });

  if (Platform.OS !== 'web') {
    return { upload: new File(result.uri), previewUri: result.uri };
  }

  const response = await fetch(result.uri);
  return { upload: await response.blob(), previewUri: result.uri };
}

export default function BookForm({
  heading,
  help,
  submitLabel,
  pendingLabel,
  initialBook,
  isPending,
  submitError,
  onLookupIsbn,
  onSubmit,
}: BookFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = React.useState(initialBook?.title ?? '');
  const [author, setAuthor] = React.useState(initialBook?.author ?? '');
  const [isbn, setIsbn] = React.useState(initialBook?.isbn13 ?? initialBook?.isbn10 ?? '');
  const [publisher, setPublisher] = React.useState(initialBook?.publisher ?? '');
  const [publishedYear, setPublishedYear] = React.useState(
    initialBook?.publishedYear !== undefined ? String(initialBook.publishedYear) : ''
  );
  const [location, setLocation] = React.useState(initialBook?.location ?? '');
  const [description, setDescription] = React.useState(initialBook?.description ?? '');
  const [cover, setCover] = React.useState<Blob | undefined>(undefined);
  const [coverName, setCoverName] = React.useState<string | undefined>(undefined);
  const [coverPreviewUri, setCoverPreviewUri] = React.useState<string | undefined>(undefined);
  const [remoteCoverUrl, setRemoteCoverUrl] = React.useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [coverError, setCoverError] = React.useState<string | undefined>(undefined);
  const [isLookingUp, setIsLookingUp] = React.useState(false);
  const [isPreparingCover, setIsPreparingCover] = React.useState(false);
  const [lookupMessage, setLookupMessage] = React.useState<string | undefined>(undefined);
  const [lookupError, setLookupError] = React.useState<string | undefined>(undefined);
  const isBusy = isPending || isLookingUp || isPreparingCover;

  const validate = React.useCallback(() => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();
    const normalizedIsbn = normalizeIsbn(isbn);
    const trimmedYear = publishedYear.trim();

    if (!trimmedTitle) errors.title = t('books.form.titleRequired');
    else if (trimmedTitle.length > MAX_TEXT_LENGTH) {
      errors.title = t('books.form.titleTooLong', { max: MAX_TEXT_LENGTH });
    }
    if (author.trim().length > MAX_TEXT_LENGTH) {
      errors.author = t('books.form.authorTooLong', { max: MAX_TEXT_LENGTH });
    }
    if (publisher.trim().length > MAX_TEXT_LENGTH) {
      errors.publisher = t('books.form.publisherTooLong', { max: MAX_TEXT_LENGTH });
    }
    if (location.trim().length > MAX_TEXT_LENGTH) {
      errors.location = t('books.form.locationTooLong', { max: MAX_TEXT_LENGTH });
    }
    if (normalizedIsbn) errors.isbn = isbnValidationMessage(normalizedIsbn, t);
    if (trimmedYear) {
      const year = Number(trimmedYear);
      if (!/^\d{1,4}$/.test(trimmedYear) || !Number.isInteger(year) || year < 0 || year > 9999) {
        errors.publishedYear = t('books.form.yearInvalid');
      }
    }

    Object.keys(errors).forEach((key) => {
      if (!errors[key as keyof FieldErrors]) delete errors[key as keyof FieldErrors];
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [author, isbn, location, publishedYear, publisher, t, title]);

  const handleIsbnChange = React.useCallback((value: string) => {
    setIsbn(value);
    setLookupMessage(undefined);
    setLookupError(undefined);
    setFieldErrors((current) => ({ ...current, isbn: undefined }));
  }, []);

  const lookupIsbn = React.useCallback(async (value = isbn) => {
    if (!onLookupIsbn || isBusy) return;
    const normalized = normalizeIsbn(value);
    const validationMessage = isbnValidationMessage(normalized, t);
    if (validationMessage) {
      setFieldErrors((current) => ({ ...current, isbn: validationMessage }));
      return;
    }

    setFieldErrors((current) => ({ ...current, isbn: undefined }));
    setLookupMessage(undefined);
    setLookupError(undefined);
    setIsLookingUp(true);
    try {
      const metadata = await onLookupIsbn(normalized);
      if (!metadata) {
        setLookupMessage(t('books.form.noMetadata'));
        return;
      }

      if (metadata.title !== undefined) setTitle(metadata.title);
      if (metadata.author !== undefined) setAuthor(metadata.author);
      if (metadata.publisher !== undefined) setPublisher(metadata.publisher);
      if (metadata.publishedYear !== undefined) setPublishedYear(String(metadata.publishedYear));
      if (metadata.description !== undefined) setDescription(metadata.description);
      if (metadata.coverUrl !== undefined) {
        setRemoteCoverUrl(metadata.coverUrl);
        setCoverPreviewUri(metadata.coverUrl);
        setCover(undefined);
        setCoverName(t('books.form.metadataCover'));
      }
      setLookupMessage(t('books.form.metadataLoaded'));
    } catch (error) {
      setLookupError(lookupErrorMessage(error, t));
    } finally {
      setIsLookingUp(false);
    }
  }, [isbn, isBusy, onLookupIsbn, t]);

  const handleScannedIsbn = React.useCallback(
    (value: string) => {
      const normalized = normalizeIsbn(value);
      setIsbn(normalized);
      setFieldErrors((current) => ({ ...current, isbn: undefined }));
      setLookupError(undefined);
      setLookupMessage(t('books.form.scanned'));
      void lookupIsbn(normalized);
    },
    [lookupIsbn, t]
  );

  const handleSelectedCover = React.useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      setCoverError(undefined);
      setIsPreparingCover(true);
      try {
        const prepared = await prepareCover(asset.uri);
        setCover(prepared.upload);
        setCoverPreviewUri(prepared.previewUri);
        setCoverName(asset.fileName ?? t('books.form.selectedCover'));
        setRemoteCoverUrl(undefined);
      } catch (error) {
        setCoverError(coverErrorMessage(error, t));
      } finally {
        setIsPreparingCover(false);
      }
    },
    [t]
  );

  const pickCover = React.useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) await handleSelectedCover(result.assets[0]);
    } catch (error) {
      setCoverError(coverErrorMessage(error, t));
    }
  }, [handleSelectedCover, t]);

  const takeCoverPhoto = React.useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCoverError(t('books.form.cameraPermissionDenied'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) await handleSelectedCover(result.assets[0]);
    } catch (error) {
      setCoverError(coverErrorMessage(error, t));
    }
  }, [handleSelectedCover, t]);

  const handleSubmit = React.useCallback(async () => {
    if (isBusy || !validate()) return;

    const normalizedIsbn = normalizeIsbn(isbn);
    const kind = normalizedIsbn ? isbnKind(normalizedIsbn) : undefined;
    const year = publishedYear.trim();
    const values: BookFormValues = {
      title: title.trim(),
      author: initialBook ? author.trim() : optionalTrimmed(author),
      publisher: initialBook ? publisher.trim() : optionalTrimmed(publisher),
      publishedYear: year ? Number(year) : undefined,
      location: initialBook ? location.trim() : optionalTrimmed(location),
      description: initialBook ? description.trim() : optionalTrimmed(description),
    };

    if (initialBook) {
      values.isbn10 = kind === 'isbn10' ? normalizedIsbn : '';
      values.isbn13 = kind === 'isbn13' ? normalizedIsbn : '';
    } else {
      if (kind === 'isbn10') values.isbn10 = normalizedIsbn;
      if (kind === 'isbn13') values.isbn13 = normalizedIsbn;
    }
    if (cover) values.cover = cover;
    else if (remoteCoverUrl) values.coverUrl = remoteCoverUrl;
    await onSubmit(values);
  }, [author, cover, description, initialBook, isbn, isBusy, location, onSubmit, publishedYear, publisher, remoteCoverUrl, title, validate]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.help}>{help}</Text>

      <Field label={t('books.form.title')} required error={fieldErrors.title}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('books.form.titlePlaceholder')}
          maxLength={MAX_TEXT_LENGTH + 1}
          autoFocus={!initialBook}
          accessibilityLabel={t('books.form.title')}
          style={[styles.input, fieldErrors.title && styles.inputError]}
        />
      </Field>

      <Field label={t('books.form.author')} error={fieldErrors.author}>
        <TextInput
          value={author}
          onChangeText={setAuthor}
          placeholder={t('books.form.author')}
          maxLength={MAX_TEXT_LENGTH + 1}
          accessibilityLabel={t('books.form.author')}
          style={[styles.input, fieldErrors.author && styles.inputError]}
        />
      </Field>

      <Field label={t('books.form.isbn')} error={fieldErrors.isbn}>
        <TextInput
          value={isbn}
          onChangeText={handleIsbnChange}
          placeholder={t('books.form.isbnPlaceholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={t('books.form.isbn')}
          style={[styles.input, fieldErrors.isbn && styles.inputError]}
        />
        <View style={styles.lookupArea}>
          {!initialBook && <BarcodeScannerButton onScan={handleScannedIsbn} disabled={isBusy} />}
          {!!onLookupIsbn && (
            <Pressable
              onPress={() => void lookupIsbn()}
              accessibilityRole="button"
              disabled={isBusy}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                isBusy && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {isLookingUp ? t('books.form.lookingUp') : t('books.form.lookup')}
              </Text>
            </Pressable>
          )}
          {!!lookupMessage && <Text style={styles.lookupMessage}>{lookupMessage}</Text>}
          {!!lookupError && <Text style={styles.errorText}>{lookupError}</Text>}
        </View>
      </Field>

      <View style={styles.row}>
        <View style={styles.rowWide}>
          <Field label={t('books.form.publisher')} error={fieldErrors.publisher}>
            <TextInput
              value={publisher}
              onChangeText={setPublisher}
              placeholder={t('books.form.publisher')}
              maxLength={MAX_TEXT_LENGTH + 1}
              accessibilityLabel={t('books.form.publisher')}
              style={[styles.input, fieldErrors.publisher && styles.inputError]}
            />
          </Field>
        </View>
        <View style={styles.rowYear}>
          <Field label={t('books.form.year')} error={fieldErrors.publishedYear}>
            <TextInput
              value={publishedYear}
              onChangeText={setPublishedYear}
              placeholder="2026"
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel={t('books.form.publishedYear')}
              style={[styles.input, fieldErrors.publishedYear && styles.inputError]}
            />
          </Field>
        </View>
      </View>

      <Field label={t('books.form.location')} error={fieldErrors.location}>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder={t('books.form.locationPlaceholder')}
          maxLength={MAX_TEXT_LENGTH + 1}
          accessibilityLabel={t('books.form.location')}
          style={[styles.input, fieldErrors.location && styles.inputError]}
        />
      </Field>

      <Field label={t('books.form.description')} error={fieldErrors.description}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('books.form.descriptionPlaceholder')}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t('books.form.description')}
          style={[styles.input, styles.multiline, fieldErrors.description && styles.inputError]}
        />
      </Field>

      <View style={styles.field}>
        <Text style={styles.label}>{t('books.form.cover')}</Text>
        {!!coverPreviewUri && (
          <Image source={{ uri: coverPreviewUri }} style={styles.coverPreview} contentFit="contain" />
        )}
        <View style={styles.coverActions}>
          <Pressable
            onPress={() => void pickCover()}
            accessibilityRole="button"
            disabled={isBusy}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              isBusy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {cover || remoteCoverUrl || initialBook?.cover
                ? t('books.form.replaceCover')
                : t('books.form.chooseCover')}
            </Text>
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable
              onPress={() => void takeCoverPhoto()}
              accessibilityRole="button"
              disabled={isBusy}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                isBusy && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{t('books.form.takePhoto')}</Text>
            </Pressable>
          )}
        </View>
        {isPreparingCover && <Text style={styles.selectedFile}>{t('books.form.resizingCover')}</Text>}
        {!isPreparingCover && !!coverName && <Text style={styles.selectedFile}>{coverName}</Text>}
        {!coverName && !!initialBook?.cover && (
          <Text style={styles.selectedFile}>{t('books.form.keepCurrentCover')}</Text>
        )}
        {!!coverError && <Text style={styles.errorText}>{coverError}</Text>}
      </View>

      {!!submitError && (
        <View accessibilityRole="alert" style={styles.submitError}>
          <Text style={styles.submitErrorTitle}>{t('books.saveErrorTitle')}</Text>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      <Pressable
        onPress={() => void handleSubmit()}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.buttonPressed,
          isBusy && styles.buttonDisabled,
        ]}
      >
        {isBusy ? (
          <View style={styles.saving}>
            <ActivityIndicator />
            <Text style={styles.saveButtonText}>
              {isLookingUp
                ? t('books.form.lookingUp')
                : isPreparingCover
                  ? t('books.form.preparingCover')
                  : pendingLabel}
            </Text>
          </View>
        ) : (
          <Text style={styles.saveButtonText}>{submitLabel}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 4 },
  heading: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  help: { fontSize: 15, opacity: 0.7, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#888', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, backgroundColor: '#fff' },
  inputError: { borderColor: '#b00020', borderWidth: 1 },
  multiline: { minHeight: 120 },
  errorText: { color: '#b00020', marginTop: 5, fontSize: 13 },
  lookupArea: { marginTop: 8, alignItems: 'flex-start', gap: 8 },
  lookupMessage: { fontSize: 13, color: '#555' },
  row: { flexDirection: 'row', gap: 12 },
  rowWide: { flex: 1 },
  rowYear: { width: 120 },
  coverPreview: { width: 120, height: 180, borderRadius: 6, backgroundColor: '#eee', marginBottom: 10 },
  coverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderColor: '#666', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },
  selectedFile: { marginTop: 6, opacity: 0.7 },
  submitError: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#b00020', borderRadius: 8, padding: 12, marginBottom: 16 },
  submitErrorTitle: { color: '#b00020', fontWeight: '700' },
  saveButton: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#1f6feb' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.55 },
});
