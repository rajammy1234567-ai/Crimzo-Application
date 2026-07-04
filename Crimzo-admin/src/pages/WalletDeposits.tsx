import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    Wallet, IndianRupee, Users, Receipt, Building2, Smartphone, CreditCard,
} from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Pagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { TableSkeleton } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { formatDate, formatNumber } from '../lib/utils';
import type { LinkedAccount, WalletDepositRow, UserDepositSummaryRow } from '../types';

function AccountDetails({ account }: { account: LinkedAccount | null | undefined }) {
    if (!account) {
        return <p className="text-sm text-gray-500">No linked bank / UPI account</p>;
    }

    const typeIcon = account.type === 'upi'
        ? <Smartphone size={16} className="text-violet-400" />
        : account.type === 'card'
            ? <CreditCard size={16} className="text-blue-400" />
            : <Building2 size={16} className="text-emerald-400" />;

    return (
        <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
                {typeIcon}
                <span className="font-semibold text-white capitalize">{account.type} account</span>
                <Badge variant={account.status === 'verified' ? 'success' : 'warning'} dot>
                    {account.status}
                </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {account.accountHolderName && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Account holder</p>
                        <p className="text-white font-medium mt-1">{account.accountHolderName}</p>
                    </div>
                )}
                {account.linkedPhone && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Phone</p>
                        <p className="text-white font-medium mt-1">{account.linkedPhone}</p>
                    </div>
                )}
                {account.upiId && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border sm:col-span-2">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">UPI ID</p>
                        <p className="text-white font-mono mt-1">{account.upiId}</p>
                    </div>
                )}
                {account.bankName && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Bank</p>
                        <p className="text-white font-medium mt-1">{account.bankName}</p>
                    </div>
                )}
                {account.accountNumber && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Account number</p>
                        <p className="text-white font-mono mt-1">{account.accountNumber}</p>
                    </div>
                )}
                {account.ifsc && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">IFSC</p>
                        <p className="text-white font-mono mt-1">{account.ifsc}</p>
                    </div>
                )}
                {account.cardLast4 && (
                    <div className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500">Card</p>
                        <p className="text-white font-mono mt-1">
                            {account.cardNetwork || 'Card'} · ****{account.cardLast4}
                        </p>
                    </div>
                )}
            </div>
            {(account.verifiedAt || account.linkedAt) && (
                <p className="text-xs text-gray-500">
                    {account.verifiedAt
                        ? `Verified: ${formatDate(account.verifiedAt)}`
                        : `Linked: ${formatDate(account.linkedAt!)}`}
                </p>
            )}
        </div>
    );
}

const WalletDeposits = () => {
    const { token } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'transactions' | 'users'>('users');
    const [typeFilter, setTypeFilter] = useState<'wallet_topup' | 'all'>('wallet_topup');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState({ totalInr: 0, totalCount: 0 });
    const [deposits, setDeposits] = useState<WalletDepositRow[]>([]);
    const [userSummaries, setUserSummaries] = useState<UserDepositSummaryRow[]>([]);
    const [accountModal, setAccountModal] = useState<{
        title: string;
        subtitle: string;
        account: LinkedAccount | null;
    } | null>(null);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await api.get('/wallet/deposits', {
                headers: authHeaders(token),
                params: { view, type: typeFilter, search, page, limit: 15 },
            });
            setDeposits(res.data.deposits || []);
            setUserSummaries(res.data.userSummaries || []);
            setTotal(res.data.total || 0);
            setTotalPages(res.data.totalPages || 1);
            setSummary(res.data.summary || { totalInr: 0, totalCount: 0 });
        } catch {
            toast.error('Failed to load wallet deposits');
        } finally {
            setLoading(false);
        }
    }, [token, view, typeFilter, search, page, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = () => {
        setPage(1);
        fetchData();
    };

    return (
        <div>
            <PageHeader
                title="Wallet & Deposits"
                description="See which user added how much money, payment method, and linked bank/UPI account details."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Wallet Deposits' }]}
                stats={[
                    { label: 'Total Added', value: `₹${formatNumber(summary.totalInr)}`, color: 'text-emerald-400' },
                    { label: 'Transactions', value: formatNumber(summary.totalCount) },
                    { label: 'Showing', value: view === 'users' ? userSummaries.length : deposits.length },
                ]}
                action={
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        onSearch={handleSearch}
                        placeholder="Search user, email, Crimzo ID..."
                        className="w-72"
                    />
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard
                    title="Total Money Added (₹)"
                    value={summary.totalInr}
                    icon={IndianRupee}
                    colorClass="bg-emerald-500/10 text-emerald-400"
                    subtitle={typeFilter === 'wallet_topup' ? 'Wallet top-ups only' : 'Top-ups + purchases'}
                />
                <StatCard
                    title="Payment Records"
                    value={summary.totalCount}
                    icon={Receipt}
                    colorClass="bg-blue-500/10 text-blue-400"
                    subtitle="Successful payments"
                />
                <StatCard
                    title="Users Listed"
                    value={total}
                    icon={Users}
                    colorClass="bg-violet-500/10 text-violet-400"
                    subtitle={view === 'users' ? 'Sorted by total added' : 'Individual transactions'}
                />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <Tabs
                    tabs={[
                        { id: 'users', label: 'By User' },
                        { id: 'transactions', label: 'All Transactions' },
                    ]}
                    active={view}
                    onChange={(id) => { setView(id as typeof view); setPage(1); }}
                />
                <Tabs
                    tabs={[
                        { id: 'wallet_topup', label: 'Wallet Top-ups' },
                        { id: 'all', label: 'All Payments' },
                    ]}
                    active={typeFilter}
                    onChange={(id) => { setTypeFilter(id as typeof typeFilter); setPage(1); }}
                />
            </div>

            <Card padding={false}>
                <div className="overflow-x-auto">
                    {view === 'users' ? (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Total Added</th>
                                    <th>Wallet Balance</th>
                                    <th>Deposits</th>
                                    <th>Last Added</th>
                                    <th>Account</th>
                                    <th className="text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7}><TableSkeleton rows={6} /></td></tr>
                                ) : userSummaries.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <EmptyState
                                                icon={Wallet}
                                                title="No deposits found"
                                                description={search ? 'Try a different search' : 'No users have added money yet'}
                                            />
                                        </td>
                                    </tr>
                                ) : userSummaries.map((row) => (
                                    <tr key={row.userId}>
                                        <td>
                                            <p className="font-semibold text-white">@{row.username}</p>
                                            <p className="text-xs text-gray-500">{row.email}</p>
                                            <p className="text-xs font-mono text-crimzo/80 mt-0.5">{row.crimzoId}</p>
                                        </td>
                                        <td className="font-bold text-emerald-400 tabular-nums">₹{formatNumber(row.totalDeposited)}</td>
                                        <td className="text-white tabular-nums">₹{formatNumber(row.walletBalance)}</td>
                                        <td className="text-gray-400">{row.depositCount}</td>
                                        <td className="text-gray-500 text-xs">{row.lastDepositAt ? formatDate(row.lastDepositAt) : '—'}</td>
                                        <td>
                                            {row.linkedAccount ? (
                                                <div>
                                                    <p className="text-xs text-white truncate max-w-[180px]">{row.linkedAccount.display}</p>
                                                    <Badge variant={row.linkedAccount.status === 'verified' ? 'success' : 'warning'}>
                                                        {row.linkedAccount.status}
                                                    </Badge>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-600">Not linked</span>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setAccountModal({
                                                    title: `@${row.username}`,
                                                    subtitle: `${row.crimzoId} · Added ₹${formatNumber(row.totalDeposited)}`,
                                                    account: row.linkedAccount || null,
                                                })}
                                            >
                                                View Account
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Payment</th>
                                    <th>Date</th>
                                    <th>Account</th>
                                    <th className="text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7}><TableSkeleton rows={6} /></td></tr>
                                ) : deposits.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <EmptyState
                                                icon={Receipt}
                                                title="No transactions"
                                                description="No payment records match your filters"
                                            />
                                        </td>
                                    </tr>
                                ) : deposits.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <p className="font-semibold text-white">@{row.username || '—'}</p>
                                            <p className="text-xs text-gray-500">{row.email}</p>
                                            <p className="text-xs font-mono text-crimzo/80">{row.crimzoId}</p>
                                        </td>
                                        <td>
                                            <p className="text-white text-sm">{row.productLabel}</p>
                                            {(row.diamonds > 0 || row.beans > 0) && (
                                                <p className="text-xs text-gray-500">
                                                    {row.diamonds > 0 ? `+${formatNumber(row.diamonds)} 💎` : ''}
                                                    {row.beans > 0 ? ` +${formatNumber(row.beans)} beans` : ''}
                                                </p>
                                            )}
                                        </td>
                                        <td className="font-bold text-emerald-400 tabular-nums">₹{formatNumber(row.amountInr)}</td>
                                        <td className="text-gray-400 text-xs">
                                            <p>{row.paymentMethodLabel}</p>
                                            {row.razorpayPaymentId && (
                                                <p className="text-gray-600 font-mono mt-0.5 truncate max-w-[120px]" title={row.razorpayPaymentId}>
                                                    {row.razorpayPaymentId}
                                                </p>
                                            )}
                                        </td>
                                        <td className="text-gray-500 text-xs whitespace-nowrap">{formatDate(row.paidAt)}</td>
                                        <td>
                                            {row.linkedAccount ? (
                                                <p className="text-xs text-white truncate max-w-[160px]">{row.linkedAccount.display}</p>
                                            ) : (
                                                <span className="text-xs text-gray-600">—</span>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setAccountModal({
                                                    title: `@${row.username || 'User'}`,
                                                    subtitle: `${row.productLabel} · ₹${formatNumber(row.amountInr)}`,
                                                    account: row.linkedAccount || null,
                                                })}
                                            >
                                                View Account
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="px-4">
                    <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
                </div>
            </Card>

            <Modal
                open={!!accountModal}
                onClose={() => setAccountModal(null)}
                title="Account Details"
                description={accountModal ? `${accountModal.title} · ${accountModal.subtitle}` : ''}
                footer={<Button variant="ghost" onClick={() => setAccountModal(null)}>Close</Button>}
            >
                {accountModal && <AccountDetails account={accountModal.account} />}
            </Modal>
        </div>
    );
};

export default WalletDeposits;