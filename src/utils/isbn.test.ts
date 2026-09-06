import {
  equivalentIsbns,
  isbn10ToIsbn13,
  isbn13ToIsbn10,
  isbnKind,
  isValidIsbn,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from './isbn';

describe('ISBN utilities', () => {
  test('normalizes formatted ISBN values', () => {
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn('0 8044 2957 x')).toBe('080442957X');
  });

  test('validates ISBN-10 check digits and shape', () => {
    expect(isValidIsbn10('0-8044-2957-X')).toBe(true);
    expect(isValidIsbn10('0-306-40615-2')).toBe(true);
    expect(isValidIsbn10('0-8044-2957-1')).toBe(false);
    expect(isValidIsbn10('123456789')).toBe(false);
  });

  test('validates ISBN-13 check digits and shape', () => {
    expect(isValidIsbn13('978-0-306-40615-7')).toBe(true);
    expect(isValidIsbn13('9781861972712')).toBe(true);
    expect(isValidIsbn13('978-0-306-40615-8')).toBe(false);
    expect(isValidIsbn13('978030640615')).toBe(false);
  });

  test('classifies valid ISBNs', () => {
    expect(isbnKind('0-306-40615-2')).toBe('isbn10');
    expect(isbnKind('978-0-306-40615-7')).toBe('isbn13');
    expect(isbnKind('not-an-isbn')).toBeUndefined();
    expect(isValidIsbn('978 0 306 40615 7')).toBe(true);
  });

  test('converts equivalent ISBN-10 and ISBN-13 values', () => {
    expect(isbn10ToIsbn13('0-306-40615-2')).toBe('9780306406157');
    expect(isbn13ToIsbn10('9780306406157')).toBe('0306406152');
    expect(isbn13ToIsbn10('9791234567896')).toBeUndefined();
  });

  test('returns normalized equivalent identifiers', () => {
    expect(equivalentIsbns('0-306-40615-2')).toEqual(['0306406152', '9780306406157']);
    expect(equivalentIsbns('978-0-306-40615-7')).toEqual(['9780306406157', '0306406152']);
    expect(equivalentIsbns('invalid')).toEqual([]);
  });
});
