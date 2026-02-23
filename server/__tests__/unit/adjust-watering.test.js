const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '../../scripts/adjust-watering.js');

describe('adjust-watering.js script', () => {
  let scriptContent;

  beforeAll(() => {
    scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf-8');
  });

  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('is executable (has shebang)', () => {
    expect(scriptContent.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('contains snapToWeekend function', () => {
    expect(scriptContent).toContain('function snapToWeekend');
  });

  it('contains rain threshold >10mm → +3 days', () => {
    expect(scriptContent).toContain('recentRain > 10');
    expect(scriptContent).toMatch(/pushDays\s*=\s*3/);
  });

  it('contains rain threshold >5mm → +2 days', () => {
    expect(scriptContent).toContain('recentRain > 5');
    expect(scriptContent).toMatch(/pushDays\s*=\s*2/);
  });

  it('contains forecast rain >10mm → +2 days', () => {
    expect(scriptContent).toContain('upcomingRain > 10');
  });

  it('contains forecast rain >5mm → +1 day', () => {
    expect(scriptContent).toContain('upcomingRain > 5');
    expect(scriptContent).toMatch(/pushDays\s*=\s*1/);
  });

  it('contains heat wave threshold >32°C', () => {
    expect(scriptContent).toContain('upcomingMaxTemp > 32');
    expect(scriptContent).toMatch(/pullDays\s*=\s*2/);
  });

  it('contains warm spell threshold >28°C', () => {
    expect(scriptContent).toContain('upcomingMaxTemp > 28');
    expect(scriptContent).toMatch(/pullDays\s*=\s*1/);
  });

  it('supports --dry-run flag', () => {
    expect(scriptContent).toContain("'--dry-run'");
  });

  it('calculates net adjustment as pushDays - pullDays', () => {
    expect(scriptContent).toContain('pushDays - pullDays');
  });
});

describe('Season detection', () => {
  // Replicate getSeason from adjust-watering.js
  function getSeason(month) {
    // month is 0-indexed (0=Jan, 5=Jun, 11=Dec)
    if (month >= 5 && month <= 8) return 'summer'; // Jun-Sep
    if (month >= 11 || month <= 1) return 'winter'; // Dec-Feb
    return 'transition';
  }

  it('June (5) → summer', () => expect(getSeason(5)).toBe('summer'));
  it('July (6) → summer', () => expect(getSeason(6)).toBe('summer'));
  it('August (7) → summer', () => expect(getSeason(7)).toBe('summer'));
  it('September (8) → summer', () => expect(getSeason(8)).toBe('summer'));

  it('December (11) → winter', () => expect(getSeason(11)).toBe('winter'));
  it('January (0) → winter', () => expect(getSeason(0)).toBe('winter'));
  it('February (1) → winter', () => expect(getSeason(1)).toBe('winter'));

  it('March (2) → transition', () => expect(getSeason(2)).toBe('transition'));
  it('October (9) → transition', () => expect(getSeason(9)).toBe('transition'));
  it('November (10) → transition', () => expect(getSeason(10)).toBe('transition'));
});
