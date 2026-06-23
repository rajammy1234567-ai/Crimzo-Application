import { diamondsToBeans, beansToInr } from './diamondPackages';

export type BeanBalanceUser = {
  beans?: number;
  pendingTaskBeans?: number;
  totalBeans?: number;
  totalWithdrawableBeans?: number;
  diamonds?: number;
  withdrawableInr?: number;
};

/** Unified earned beans: gifts + calls + chats + pending task rewards */
export function getDisplayBeans(user?: BeanBalanceUser | null): number {
  if (!user) return 0;
  if (typeof user.totalBeans === 'number') return user.totalBeans;
  return (user.beans ?? 0) + (user.pendingTaskBeans ?? 0);
}

export function getWithdrawableBeans(user?: BeanBalanceUser | null): number {
  if (!user) return 0;
  if (typeof user.totalWithdrawableBeans === 'number') return user.totalWithdrawableBeans;
  return getDisplayBeans(user) + diamondsToBeans(user.diamonds ?? 0);
}

export function getWithdrawableInr(user?: BeanBalanceUser | null): number {
  if (!user) return 0;
  if (typeof user.withdrawableInr === 'number') return user.withdrawableInr;
  return beansToInr(getWithdrawableBeans(user));
}

export function mergeBeanBalance(
  current: BeanBalanceUser | null | undefined,
  patch: BeanBalanceUser,
): BeanBalanceUser {
  const beans = patch.beans ?? current?.beans ?? 0;
  const pendingTaskBeans = patch.pendingTaskBeans ?? current?.pendingTaskBeans ?? 0;
  const diamonds = patch.diamonds ?? current?.diamonds ?? 0;
  const totalBeans = patch.totalBeans ?? beans + pendingTaskBeans;
  const totalWithdrawableBeans = patch.totalWithdrawableBeans
    ?? totalBeans + diamondsToBeans(diamonds);
  return {
    beans,
    pendingTaskBeans,
    totalBeans,
    totalWithdrawableBeans,
    diamonds,
    withdrawableInr: patch.withdrawableInr ?? beansToInr(totalWithdrawableBeans),
  };
}