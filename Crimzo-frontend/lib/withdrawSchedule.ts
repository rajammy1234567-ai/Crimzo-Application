const WITHDRAW_DAY = 7;

export function isWithdrawDay(date: Date = new Date()): boolean {
  return date.getDate() === WITHDRAW_DAY;
}

export function nextWithdrawDate(from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  if (from.getDate() < WITHDRAW_DAY) {
    return new Date(year, month, WITHDRAW_DAY);
  }
  return new Date(year, month + 1, WITHDRAW_DAY);
}

export function formatWithdrawDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const WITHDRAW_DAY_MESSAGE =
  'Withdrawals are only available on the 7th of every month.';

export function withdrawUnavailableMessage(from: Date = new Date()): string {
  const next = nextWithdrawDate(from);
  return `${WITHDRAW_DAY_MESSAGE}\n\nNext withdrawal date: ${formatWithdrawDate(next)}`;
}