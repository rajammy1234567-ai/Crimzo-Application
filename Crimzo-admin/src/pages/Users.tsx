import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    ShieldAlert, ShieldCheck, Diamond as DiamondIcon, Users as UsersIcon,
    Plus, Minus, Receipt, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { Tabs } from '../components/ui/Tabs';
import { Pagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, formatNumber } from '../lib/utils';
import type { User, UserTransactionRow, UserTransactionSummary } from '../types';

const Users = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState<'all' | 'active' | 'banned'>('all');
    const { token } = useAuth();
    const toast = useToast();

    const [diamondModal, setDiamondModal] = useState<{ user: User; action: 'add' | 'deduct' } | null>(null);
    const [diamondAmount, setDiamondAmount] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [banModal, setBanModal] = useState<User | null>(null);
    const [txModal, setTxModal] = useState<User | null>(null);
    const [txLoading, setTxLoading] = useState(false);
    const [txRows, setTxRows] = useState<UserTransactionRow[]>([]);
    const [txSummary, setTxSummary] = useState<UserTransactionSummary | null>(null);
    const [txFilter, setTxFilter] = useState<'all' | 'deposits' | 'withdrawals'>('all');

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/users', {
                headers: authHeaders(token),
                params: { search, page, limit: 15, filter },
            });
            setUsers(res.data.users as User[]);
            setTotal(res.data.total);
            setTotalPages(res.data.totalPages);
        } catch {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [page, token, filter]);

    const handleSearch = () => {
        setPage(1);
        fetchUsers();
    };

    const toggleBan = async (user: User) => {
        setActionLoading(true);
        try {
            await api.put(`/users/${user.id || user._id}/ban`, { is_banned: !user.is_banned }, {
                headers: authHeaders(token),
            });
            toast.success(user.is_banned ? `${user.username} unbanned` : `${user.username} banned`);
            setBanModal(null);
            fetchUsers();
        } catch {
            toast.error('Failed to update ban status');
        } finally {
            setActionLoading(false);
        }
    };

    const adjustDiamonds = async () => {
        if (!diamondModal || !diamondAmount || isNaN(Number(diamondAmount))) return;
        setActionLoading(true);
        try {
            await api.put(`/users/${diamondModal.user.id || diamondModal.user._id}/diamonds`, {
                action: diamondModal.action,
                amount: Number(diamondAmount),
            }, { headers: authHeaders(token) });
            toast.success(`${diamondModal.action === 'add' ? 'Added' : 'Deducted'} ${diamondAmount} diamonds from ${diamondModal.user.username}`);
            setDiamondModal(null);
            setDiamondAmount('');
            fetchUsers();
        } catch {
            toast.error('Failed to adjust diamonds');
        } finally {
            setActionLoading(false);
        }
    };

    const openUserTransactions = async (user: User) => {
        setTxModal(user);
        setTxFilter('all');
        setTxLoading(true);
        setTxRows([]);
        setTxSummary(null);
        try {
            const res = await api.get(`/users/${user.id || user._id}/transactions`, {
                headers: authHeaders(token),
                params: { limit: 80 },
            });
            const list = Array.isArray(res.data?.transactions) ? res.data.transactions : [];
            setTxRows(list.map((row: Record<string, unknown>) => ({
                id: String(row.id ?? ''),
                category: (row.category as UserTransactionRow['category']) || 'deposit',
                type: String(row.type ?? ''),
                direction: (row.direction as UserTransactionRow['direction']) || 'credit',
                amountInr: Number(row.amountInr ?? 0),
                title: String(row.title ?? 'Transaction'),
                subtitle: String(row.subtitle ?? ''),
                status: String(row.status ?? 'completed'),
                diamonds: row.diamonds != null ? Number(row.diamonds) : undefined,
                beans: row.beans != null ? Number(row.beans) : undefined,
                payoutDisplay: (row.payoutDisplay as string) ?? null,
                scheduledCreditDate: (row.scheduledCreditDate as string) ?? null,
                utr: (row.utr as string) ?? null,
                failureReason: (row.failureReason as string) ?? null,
                createdAt: String(row.createdAt ?? ''),
                completedAt: (row.completedAt as string) ?? null,
            })));
            setTxSummary(res.data?.summary ?? null);
        } catch {
            toast.error('Failed to load transaction history');
        } finally {
            setTxLoading(false);
        }
    };

    const filteredTxRows = txRows.filter((row) => {
        if (txFilter === 'deposits') return row.category === 'deposit';
        if (txFilter === 'withdrawals') return row.category === 'withdraw';
        return true;
    });

    const txStatusVariant = (status: string) => {
        if (status === 'completed') return 'success';
        if (status === 'failed') return 'danger';
        if (status === 'pending') return 'warning';
        return 'info';
    };

    const bannedCount = users.filter(u => u.is_banned).length;

    return (
        <div>
            <PageHeader
                title="Users Management"
                description="Search, monitor, ban/unban users, and manage diamond balances."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Users' }]}
                stats={[
                    { label: 'Showing', value: users.length },
                    { label: 'Total', value: formatNumber(total) },
                    { label: 'Banned (page)', value: bannedCount, color: 'text-red-400' },
                ]}
                action={
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        onSearch={handleSearch}
                        placeholder="Search by ID, username, email..."
                        className="w-72"
                    />
                }
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <Tabs
                    tabs={[
                        { id: 'all', label: 'All Users' },
                        { id: 'active', label: 'Active' },
                        { id: 'banned', label: 'Banned' },
                    ]}
                    active={filter}
                    onChange={id => { setFilter(id as typeof filter); setPage(1); }}
                />
            </div>

            <Card padding={false}>
                <div className="overflow-x-auto">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Crimzo ID</th>
                                <th>User</th>
                                <th>Country</th>
                                <th>Diamonds</th>
                                <th>Joined</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7}><TableSkeleton rows={6} /></td></tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <EmptyState
                                            icon={UsersIcon}
                                            title="No users found"
                                            description={search ? 'Try a different search term' : 'No users match the current filter'}
                                        />
                                    </td>
                                </tr>
                            ) : users.map(u => (
                                <tr key={u.id || u._id}>
                                    <td>
                                        <span className="font-mono text-crimzo text-xs bg-crimzo/10 px-2 py-1 rounded-md">
                                            {u.crimzo_id || 'N/A'}
                                        </span>
                                    </td>
                                    <td>
                                        <p className="font-semibold text-white">{u.username}</p>
                                        <p className="text-xs text-gray-500">{u.email}</p>
                                    </td>
                                    <td className="text-gray-400">{u.country || '—'}</td>
                                    <td>
                                        <span className="inline-flex items-center gap-1 font-semibold text-white tabular-nums">
                                            {formatNumber(u.diamonds)}
                                            <DiamondIcon size={12} className="text-crimzo" />
                                        </span>
                                    </td>
                                    <td className="text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                                    <td>
                                        {u.is_banned ? (
                                            <Badge variant="danger" dot>Banned</Badge>
                                        ) : (
                                            <Badge variant="success" dot>Active</Badge>
                                        )}
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openUserTransactions(u)}
                                                icon={<Receipt size={16} className="text-violet-400" />}
                                                title="Transaction history"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setDiamondModal({ user: u, action: 'add' }); setDiamondAmount(''); }}
                                                icon={<Plus size={14} className="text-blue-400" />}
                                                title="Add diamonds"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setDiamondModal({ user: u, action: 'deduct' }); setDiamondAmount(''); }}
                                                icon={<Minus size={14} className="text-amber-400" />}
                                                title="Deduct diamonds"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setBanModal(u)}
                                                icon={u.is_banned
                                                    ? <ShieldCheck size={16} className="text-emerald-400" />
                                                    : <ShieldAlert size={16} className="text-red-400" />
                                                }
                                                title={u.is_banned ? 'Unban user' : 'Ban user'}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-4">
                    <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
                </div>
            </Card>

            <Modal
                open={!!diamondModal}
                onClose={() => setDiamondModal(null)}
                title={diamondModal?.action === 'add' ? 'Add Diamonds' : 'Deduct Diamonds'}
                description={diamondModal ? `Adjust balance for @${diamondModal.user.username} (current: ${diamondModal.user.diamonds} 💎)` : ''}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setDiamondModal(null)}>Cancel</Button>
                        <Button
                            variant={diamondModal?.action === 'add' ? 'primary' : 'danger'}
                            loading={actionLoading}
                            onClick={adjustDiamonds}
                        >
                            {diamondModal?.action === 'add' ? 'Add Diamonds' : 'Deduct Diamonds'}
                        </Button>
                    </>
                }
            >
                <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 block">Amount</label>
                    <input
                        type="number"
                        min="1"
                        value={diamondAmount}
                        onChange={e => setDiamondAmount(e.target.value)}
                        className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-crimzo/50"
                        placeholder="Enter diamond amount"
                        autoFocus
                    />
                </div>
            </Modal>

            <Modal
                open={!!txModal}
                onClose={() => setTxModal(null)}
                title="Transaction History"
                description={txModal ? `@${txModal.username} · ${txModal.crimzo_id || txModal.email}` : ''}
                size="lg"
                footer={
                    <Button variant="ghost" onClick={() => setTxModal(null)}>Close</Button>
                }
            >
                {txModal && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-dark-bg rounded-xl border border-dark-border">
                            <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 font-bold text-lg">
                                {txModal.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white">{txModal.username}</p>
                                <p className="text-sm text-gray-500 truncate">{txModal.email}</p>
                                <p className="text-xs text-gray-600 font-mono mt-0.5">{txModal.crimzo_id}</p>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                                <p>💎 {formatNumber(txModal.diamonds)}</p>
                                <p className="mt-1">🫘 {formatNumber(txModal.beans || 0)}</p>
                            </div>
                        </div>

                        {txSummary && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold">Added</p>
                                    <p className="text-lg font-bold text-white tabular-nums">
                                        ₹{formatNumber(txSummary.totalDeposited + txSummary.totalPurchased)}
                                    </p>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">Withdrawn</p>
                                    <p className="text-lg font-bold text-white tabular-nums">₹{formatNumber(txSummary.totalWithdrawn)}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <p className="text-[10px] uppercase tracking-wider text-orange-400/80 font-bold">Pending</p>
                                    <p className="text-lg font-bold text-white tabular-nums">₹{formatNumber(txSummary.pendingWithdrawn)}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <p className="text-[10px] uppercase tracking-wider text-blue-400/80 font-bold">Records</p>
                                    <p className="text-lg font-bold text-white tabular-nums">{txRows.length}</p>
                                </div>
                            </div>
                        )}

                        <Tabs
                            tabs={[
                                { id: 'all', label: 'All' },
                                { id: 'deposits', label: 'Deposits' },
                                { id: 'withdrawals', label: 'Withdrawals' },
                            ]}
                            active={txFilter}
                            onChange={(id) => setTxFilter(id as typeof txFilter)}
                        />

                        {txLoading ? (
                            <TableSkeleton rows={5} />
                        ) : filteredTxRows.length === 0 ? (
                            <EmptyState
                                icon={Receipt}
                                title="No transactions"
                                description="This user has not made any wallet or withdrawal activity yet."
                            />
                        ) : (
                            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-dark-border">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-dark-card z-10">
                                        <tr className="text-left text-gray-500 border-b border-dark-border">
                                            <th className="p-3 font-medium">Type</th>
                                            <th className="p-3 font-medium">Details</th>
                                            <th className="p-3 font-medium">Amount</th>
                                            <th className="p-3 font-medium">Status</th>
                                            <th className="p-3 font-medium">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-dark-border/60">
                                        {filteredTxRows.map((row) => (
                                            <tr key={row.id} className="hover:bg-white/[0.02]">
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        {row.direction === 'credit' ? (
                                                            <ArrowDownLeft size={14} className="text-emerald-400" />
                                                        ) : (
                                                            <ArrowUpRight size={14} className="text-amber-400" />
                                                        )}
                                                        <span className="text-white font-medium">{row.title}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-gray-400 text-xs max-w-[220px]">
                                                    <p>{row.subtitle}</p>
                                                    {row.scheduledCreditDate && row.status === 'pending' && (
                                                        <p className="text-amber-400/90 mt-1">
                                                            Credit: {formatDate(row.scheduledCreditDate)}
                                                        </p>
                                                    )}
                                                    {row.utr && <p className="text-gray-500 mt-1">UTR: {row.utr}</p>}
                                                </td>
                                                <td className={`p-3 font-bold tabular-nums ${row.direction === 'credit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {row.direction === 'credit' ? '+' : '−'}₹{formatNumber(row.amountInr)}
                                                </td>
                                                <td className="p-3">
                                                    <Badge variant={txStatusVariant(row.status)} dot>
                                                        {row.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                                                    {formatDate(row.createdAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                open={!!banModal}
                onClose={() => setBanModal(null)}
                title={banModal?.is_banned ? 'Unban User' : 'Ban User'}
                description={banModal ? `Are you sure you want to ${banModal.is_banned ? 'unban' : 'ban'} @${banModal.username}?${!banModal.is_banned ? ' Their active streams will be terminated.' : ''}` : ''}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setBanModal(null)}>Cancel</Button>
                        <Button
                            variant={banModal?.is_banned ? 'primary' : 'danger'}
                            loading={actionLoading}
                            onClick={() => banModal && toggleBan(banModal)}
                        >
                            {banModal?.is_banned ? 'Unban User' : 'Ban User'}
                        </Button>
                    </>
                }
            >
                {banModal && (
                    <div className="flex items-center gap-4 p-4 bg-dark-bg rounded-xl border border-dark-border">
                        <div className="w-12 h-12 rounded-full bg-crimzo/20 flex items-center justify-center text-crimzo font-bold text-lg">
                            {banModal.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-semibold text-white">{banModal.username}</p>
                            <p className="text-sm text-gray-500">{banModal.email}</p>
                            <p className="text-xs text-gray-600 font-mono mt-0.5">{banModal.crimzo_id}</p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Users;