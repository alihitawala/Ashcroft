/**
 * Tests for shared.js utility functions.
 * Source: /home/ashcroft/www/app/shared.js
 */
const { sharedFormatDate, sharedFormatRelativeDate, sharedGetGreeting, sharedGetTodayStr } = require('../../test-helpers/frontend-utils');

describe('shared formatDate', () => {
  test('formats date as short month + day', () => {
    const result = sharedFormatDate('2026-03-15');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  test('handles ISO timestamp', () => {
    const result = sharedFormatDate('2026-01-01T00:00:00.000Z');
    expect(result).toContain('Jan');
    expect(result).toContain('1');
  });
});

describe('shared formatRelativeDate', () => {
  const now = new Date('2026-02-22T12:00:00Z');

  test('today', () => {
    expect(sharedFormatRelativeDate('2026-02-22', now)).toBe('Today');
  });

  test('tomorrow', () => {
    expect(sharedFormatRelativeDate('2026-02-23', now)).toBe('Tomorrow');
  });

  test('yesterday', () => {
    expect(sharedFormatRelativeDate('2026-02-21', now)).toBe('Yesterday');
  });

  test('within 7 days shows weekday', () => {
    const result = sharedFormatRelativeDate('2026-02-25', now);
    expect(result).toBe('Wednesday');
  });

  test('far future falls back to short date', () => {
    const result = sharedFormatRelativeDate('2026-06-15', now);
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });

  test('past date beyond yesterday falls back to short date', () => {
    const result = sharedFormatRelativeDate('2026-01-01', now);
    expect(result).toContain('Jan');
  });
});

describe('shared getGreeting', () => {
  test('morning (6am)', () => {
    expect(sharedGetGreeting(6)).toBe('Good morning');
  });

  test('afternoon (14)', () => {
    expect(sharedGetGreeting(14)).toBe('Good afternoon');
  });

  test('evening (20)', () => {
    expect(sharedGetGreeting(20)).toBe('Good evening');
  });

  test('midnight', () => {
    expect(sharedGetGreeting(0)).toBe('Good morning');
  });

  test('noon boundary', () => {
    expect(sharedGetGreeting(12)).toBe('Good afternoon');
  });

  test('5pm boundary', () => {
    expect(sharedGetGreeting(17)).toBe('Good evening');
  });
});

describe('shared getTodayStr', () => {
  test('formats as YYYY-MM-DD', () => {
    expect(sharedGetTodayStr(new Date(2026, 1, 5))).toBe('2026-02-05');
  });

  test('pads single-digit month and day', () => {
    expect(sharedGetTodayStr(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  test('december', () => {
    expect(sharedGetTodayStr(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});
