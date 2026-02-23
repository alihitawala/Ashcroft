/**
 * Tests for iftar invitation utility functions.
 * Source: /home/ashcroft/www/public/iftar/index.html (inline JS)
 */
const { iftarFormatDate, iftarFmtTime, iftarEsc } = require('../../test-helpers/frontend-utils');

describe('iftar formatDate', () => {
  test('ISO timestamp "2026-02-28T00:00:00.000Z" → February 28 (UTC regression test)', () => {
    const result = iftarFormatDate('2026-02-28T00:00:00.000Z');
    expect(result).toContain('February 28');
    expect(result).not.toContain('February 27'); // timezone bug regression
  });

  test('plain date "2026-02-28"', () => {
    const result = iftarFormatDate('2026-02-28');
    expect(result).toContain('February 28');
  });

  test('includes weekday and year', () => {
    const result = iftarFormatDate('2026-02-28T00:00:00.000Z');
    expect(result).toContain('Saturday');
    expect(result).toContain('2026');
  });

  test('null returns empty string', () => {
    expect(iftarFormatDate(null)).toBe('');
  });

  test('undefined returns empty string', () => {
    expect(iftarFormatDate(undefined)).toBe('');
  });

  test('empty string returns empty string', () => {
    expect(iftarFormatDate('')).toBe('');
  });
});

describe('iftar fmtTime', () => {
  test('"16:30:00" → "4:30 PM"', () => {
    expect(iftarFmtTime('16:30:00')).toBe('4:30 PM');
  });

  test('"06:00:00" → "6 AM"', () => {
    expect(iftarFmtTime('06:00:00')).toBe('6 AM');
  });

  test('"00:00:00" → "12 AM"', () => {
    expect(iftarFmtTime('00:00:00')).toBe('12 AM');
  });

  test('"12:00:00" → "12 PM"', () => {
    expect(iftarFmtTime('12:00:00')).toBe('12 PM');
  });

  test('"18:02:00" → "6:02 PM"', () => {
    expect(iftarFmtTime('18:02:00')).toBe('6:02 PM');
  });

  test('null → ""', () => {
    expect(iftarFmtTime(null)).toBe('');
  });

  test('undefined → ""', () => {
    expect(iftarFmtTime(undefined)).toBe('');
  });
});

describe('iftar esc (HTML escaping)', () => {
  test('escapes script tags', () => {
    expect(iftarEsc("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert('xss')&lt;/script&gt;");
  });

  test('escapes ampersand', () => {
    expect(iftarEsc('a & b')).toBe('a &amp; b');
  });

  test('escapes < and >', () => {
    expect(iftarEsc('1 < 2 > 0')).toBe('1 &lt; 2 &gt; 0');
  });

  test('null → ""', () => {
    expect(iftarEsc(null)).toBe('');
  });

  test('empty string → ""', () => {
    expect(iftarEsc('')).toBe('');
  });

  test('plain text passes through', () => {
    expect(iftarEsc('hello world')).toBe('hello world');
  });

  test('passes through quotes (not escaped)', () => {
    expect(iftarEsc('"quoted"')).toBe('"quoted"');
  });

  test('escapes nested HTML tags', () => {
    expect(iftarEsc('<div><span>nested</span></div>')).toBe('&lt;div&gt;&lt;span&gt;nested&lt;/span&gt;&lt;/div&gt;');
  });

  test('escapes mixed ampersands and tags but not quotes', () => {
    expect(iftarEsc('Tom & Jerry "show" <fun>')).toBe('Tom &amp; Jerry "show" &lt;fun&gt;');
  });
});

describe('iftar fmtTime edge cases', () => {
  test('"23:59:00" → "11:59 PM"', () => {
    expect(iftarFmtTime('23:59:00')).toBe('11:59 PM');
  });

  test('"12:30:00" → "12:30 PM"', () => {
    expect(iftarFmtTime('12:30:00')).toBe('12:30 PM');
  });

  test('"00:30:00" → "12:30 AM"', () => {
    expect(iftarFmtTime('00:30:00')).toBe('12:30 AM');
  });

  test('"13:00:00" → "1 PM"', () => {
    expect(iftarFmtTime('13:00:00')).toBe('1 PM');
  });
});
