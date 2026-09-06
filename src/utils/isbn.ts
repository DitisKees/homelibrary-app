export type IsbnKind = 'isbn10' | 'isbn13';

export function normalizeIsbn(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn10(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const digit = index === 9 && isbn[index] === 'X' ? 10 : Number(isbn[index]);
    sum += digit * (10 - index);
  }

  return sum % 11 === 0;
}

export function isValidIsbn13(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;

  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(isbn[index]) * (index % 2 === 0 ? 1 : 3);
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(isbn[12]);
}

export function isbnKind(value: string): IsbnKind | undefined {
  const isbn = normalizeIsbn(value);
  if (isbn.length === 10 && isValidIsbn10(isbn)) return 'isbn10';
  if (isbn.length === 13 && isValidIsbn13(isbn)) return 'isbn13';
  return undefined;
}

export function isValidIsbn(value: string): boolean {
  return isbnKind(value) !== undefined;
}

export function isbn10ToIsbn13(value: string): string | undefined {
  const isbn10 = normalizeIsbn(value);
  if (!isValidIsbn10(isbn10)) return undefined;

  const body = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function isbn13ToIsbn10(value: string): string | undefined {
  const isbn13 = normalizeIsbn(value);
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith('978')) return undefined;

  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    sum += Number(body[index]) * (10 - index);
  }
  const checkValue = (11 - (sum % 11)) % 11;
  const checkDigit = checkValue === 10 ? 'X' : String(checkValue);
  return `${body}${checkDigit}`;
}

export function equivalentIsbns(value: string): string[] {
  const normalized = normalizeIsbn(value);
  const kind = isbnKind(normalized);
  if (!kind) return [];

  const equivalent = kind === 'isbn10' ? isbn10ToIsbn13(normalized) : isbn13ToIsbn10(normalized);
  return equivalent ? [normalized, equivalent] : [normalized];
}
