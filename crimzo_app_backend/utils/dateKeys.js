const IST_TIMEZONE = 'Asia/Kolkata';
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKeyFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
}

/** Calendar date in IST as YYYY-MM-DD */
function dateKeyInTimezone(date = new Date(), timeZone = IST_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

function todayKey() {
  return dateKeyInTimezone(new Date());
}

function yesterdayKey() {
  return shiftDateKey(todayKey(), -1);
}

function shiftDateKey(dateKey, deltaDays) {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dateKeyFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayLabel(dateKey) {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_LABELS[dt.getUTCDay()];
}

function monthKey(date = new Date()) {
  return dateKeyInTimezone(date).slice(0, 7);
}

function previousMonthKey(date = new Date()) {
  const firstOfMonth = `${monthKey(date)}-01`;
  return shiftDateKey(firstOfMonth, -1).slice(0, 7);
}

function dayOfMonthIST(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en', { timeZone: IST_TIMEZONE, day: 'numeric' }).format(date),
  );
}

function formatMonthLabel(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
}

module.exports = {
  IST_TIMEZONE,
  dateKeyInTimezone,
  todayKey,
  yesterdayKey,
  shiftDateKey,
  weekdayLabel,
  monthKey,
  previousMonthKey,
  dayOfMonthIST,
  formatMonthLabel,
};