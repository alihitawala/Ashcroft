/**
 * Extracted utility functions for testing.
 * These are copied from the source files to make them testable in Node/Jest.
 */

// ── From /home/ashcroft/www/public/iftar/index.html (inline <script>) ──

/** formatDate — line ~"function formatDate(s){" in iftar/index.html */
function iftarFormatDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch (e) { return s; }
}

/** fmtTime — defined inside renderInvite() in iftar/index.html */
function iftarFmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

/** esc — HTML escaping, iftar/index.html */
function iftarEsc(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

// ── From /home/ashcroft/www/app/shared.js ──

/** formatDate — shared.js */
function sharedFormatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** formatRelativeDate — shared.js */
function sharedFormatRelativeDate(dateStr, now) {
  const d = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff <= 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return sharedFormatDate(dateStr);
}

/** getGreeting — shared.js */
function sharedGetGreeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** getTodayStr — shared.js */
function sharedGetTodayStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  iftarFormatDate,
  iftarFmtTime,
  iftarEsc,
  sharedFormatDate,
  sharedFormatRelativeDate,
  sharedGetGreeting,
  sharedGetTodayStr,
};
