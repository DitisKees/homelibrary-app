import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useActiveLoan, useCreateLoan, useMarkLoanReturned } from '@/hooks/useLoans';
import { formatDate } from '@/i18n';

const MAX_TEXT_LENGTH = 500;

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function storedDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function BookLoanSection({ bookId }: { bookId: string }) {
  const { t, i18n } = useTranslation();
  const {
    data: activeLoan,
    isPending,
    isError,
    error,
    refetch,
  } = useActiveLoan(bookId);
  const createLoan = useCreateLoan(bookId);
  const markReturned = useMarkLoanReturned();
  const [showForm, setShowForm] = React.useState(false);
  const [borrowerName, setBorrowerName] = React.useState('');
  const [borrowerContact, setBorrowerContact] = React.useState('');
  const [dateLent, setDateLent] = React.useState(todayInputValue);
  const [dateDue, setDateDue] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>();
  const busy = createLoan.isPending || markReturned.isPending;

  const resetForm = React.useCallback(() => {
    setBorrowerName('');
    setBorrowerContact('');
    setDateLent(todayInputValue());
    setDateDue('');
    setNotes('');
    setFormError(undefined);
  }, []);

  const submitLoan = React.useCallback(async () => {
    if (busy) return;
    const name = borrowerName.trim();
    if (!name) {
      setFormError(t('lending.borrowerRequired'));
      return;
    }
    if (!isValidDateInput(dateLent)) {
      setFormError(t('lending.lentDateInvalid'));
      return;
    }
    if (dateDue && !isValidDateInput(dateDue)) {
      setFormError(t('lending.dueDateInvalid'));
      return;
    }
    if (dateDue && dateDue < dateLent) {
      setFormError(t('lending.dueBeforeLent'));
      return;
    }

    setFormError(undefined);
    try {
      await createLoan.mutateAsync({
        borrowerName: name,
        borrowerContact: borrowerContact.trim() || undefined,
        dateLent: storedDate(dateLent),
        dateDue: dateDue ? storedDate(dateDue) : undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
      setShowForm(false);
    } catch (mutationError) {
      setFormError(errorMessage(mutationError, t('lending.lendError')));
    }
  }, [borrowerContact, borrowerName, busy, createLoan, dateDue, dateLent, notes, resetForm, t]);

  const returnLoan = React.useCallback(async () => {
    if (!activeLoan || busy) return;
    setFormError(undefined);
    try {
      await markReturned.mutateAsync(activeLoan.id);
    } catch (mutationError) {
      setFormError(errorMessage(mutationError, t('lending.returnStatusError')));
    }
  }, [activeLoan, busy, markReturned, t]);

  const lentDate = formatDate(activeLoan?.dateLent, i18n.resolvedLanguage);
  const dueDate = formatDate(activeLoan?.dateDue, i18n.resolvedLanguage);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('lending.sectionTitle')}</Text>
      {isPending ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.secondaryText}>{t('lending.loadingStatus')}</Text>
        </View>
      ) : isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : t('lending.loadStatusError')}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : activeLoan ? (
        <View style={styles.loanCard}>
          <Text style={styles.loanTitle}>{t('lending.lentTo', { name: activeLoan.borrowerName })}</Text>
          {!!lentDate && <Text style={styles.secondaryText}>{t('lending.lentDate', { date: lentDate })}</Text>}
          {!!dueDate && <Text style={styles.secondaryText}>{t('lending.dueDate', { date: dueDate })}</Text>}
          {!!activeLoan.borrowerContact && <Text>{activeLoan.borrowerContact}</Text>}
          {!!activeLoan.notes && <Text style={styles.notes}>{activeLoan.notes}</Text>}
          <Pressable
            onPress={() => void returnLoan()}
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {markReturned.isPending ? t('lending.markingReturned') : t('lending.markReturned')}
            </Text>
          </Pressable>
        </View>
      ) : showForm ? (
        <View style={styles.form}>
          <TextInput
            value={borrowerName}
            onChangeText={setBorrowerName}
            placeholder={t('lending.borrowerNamePlaceholder')}
            accessibilityLabel={t('lending.borrowerName')}
            maxLength={MAX_TEXT_LENGTH}
            style={styles.input}
          />
          <TextInput
            value={borrowerContact}
            onChangeText={setBorrowerContact}
            placeholder={t('lending.borrowerContactPlaceholder')}
            accessibilityLabel={t('lending.borrowerContact')}
            maxLength={MAX_TEXT_LENGTH}
            style={styles.input}
          />
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.label}>{t('lending.lentDateLabel')}</Text>
              <TextInput
                value={dateLent}
                onChangeText={setDateLent}
                placeholder={t('lending.datePlaceholder')}
                accessibilityLabel={t('lending.lentDateLabel')}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.label}>{t('lending.dueDateLabel')}</Text>
              <TextInput
                value={dateDue}
                onChangeText={setDateDue}
                placeholder={t('lending.datePlaceholder')}
                accessibilityLabel={t('lending.dueDateLabel')}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('lending.notesPlaceholder')}
            accessibilityLabel={t('lending.notes')}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.notesInput]}
          />
          {!!formError && <Text style={styles.errorText}>{formError}</Text>}
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                resetForm();
                setShowForm(false);
              }}
              accessibilityRole="button"
              disabled={busy}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void submitLoan()}
              accessibilityRole="button"
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {createLoan.isPending ? t('common.saving') : t('lending.lendBook')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowForm(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{t('lending.lendBook')}</Text>
        </Pressable>
      )}
      {!!formError && !!activeLoan && <Text style={styles.errorText}>{formError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryText: { fontSize: 14, color: '#666' },
  errorBox: { alignItems: 'flex-start', gap: 10 },
  errorText: { color: '#b00020' },
  loanCard: {
    maxWidth: 560,
    gap: 8,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  loanTitle: { fontSize: 16, fontWeight: '700' },
  notes: { fontSize: 14, lineHeight: 20, color: '#444' },
  form: { maxWidth: 640, gap: 10 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    borderRadius: 8,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  notesInput: { minHeight: 88 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dateField: { flexGrow: 1, minWidth: 180, gap: 5 },
  label: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#666',
  },
  secondaryButtonText: { fontWeight: '600' },
  primaryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1f6feb',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
});