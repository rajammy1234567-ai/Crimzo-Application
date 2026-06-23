import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    Banknote, CheckCircle, XCircle, Copy, Clock, IndianRupee,
} from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Pagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { StatCard } from '../components/ui/StatCard';
import { formatDate, formatNumber } from '../lib/utils';
import type { WithdrawalRow } from '../types';

const statusTabs = [
    { id: 'pending', label: 'Pending' },
    { id: 'processing', label: 'Processing' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
    { id: 'all', label: 'All' },
];

const statusVariant = (status: string) => {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'pending') return 'warning';
    return 'info';
};

function payoutDetailsText(row: WithdrawalRow): string {
    const s = row.payoutSnapshot;
    if (!s) return row.payoutDisplay || '—';
    if (s.type === 'upi' && s.upi_id) {
        return `UPI: ${s.upi_id}\nName: ${s.account_holder_name || '—'}\nPhone: ${s.linked_phone || '—'}`;
    }
    if (s.account_number) {
        return `Bank: ${s.bank_name || '—'}\nA/C: ${s.account_number}\nIFSC: ${s.ifsc || '—'}\nName: ${s.account_holder_name || '—'}\nPhone: ${s.linked_phone || '—'}`;
    }
    return row.payoutDisplay || '—';
}

const Withdrawals = () => {
    const { token } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('pending');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [rows, setRows] = useState<WithdrawalRow[]>([]);
    const [counts, setCounts] = useState({ pending: 0, processing: 0 });
    const [actionLoading, setActionLoading] = useState(false);

    const [completeModal, setCompleteModal] = useState<WithdrawalRow | null>(null);
    const [rejectModal, setRejectModal] = useState<WithdrawalRow | null>(null);
    const [utr, setUtr] = useState('');
    const [adminNote, setAdminNote] = useState('');
    const [rejectReason, setRejectReason] = useState('');

    const fetchWithdrawals = async () => {
        setLoading(true);
        try {
            const res = await api.get('/withdrawals', {
                headers: authHeaders(token),
                params: { status, page, limit: 15 },
            });
            setRows(res.data.withdrawals || []);
            setTotalPages(res.data.totalPages || 1);
            setCounts(res.data.counts || { pending: 0, processing: 0 });
        } catch {
            toast.error('Failed to load withdrawals');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWithdrawals();
    }, [page, status, token]);

    const copyPayout = async (row: WithdrawalRow) => {
        try {
            await navigator.clipboard.writeText(payoutDetailsText(row));
            toast.success('Payout details copied');
        } catch {
            toast.error('Could not copy');
        }
    };

    const markComplete = async () => {
        if (!completeModal || !utr.trim()) return;
        setActionLoading(true);
        try {
            await api.put(`/withdrawals/${completeModal.id}/complete`, {
                utr: utr.trim(),
                admin_note: adminNote.trim() || undefined,
            }, { headers: authHeaders(token) });
            toast.success(`₹${completeModal.amountInr} marked complete`);
            setCompleteModal(null);
            setUtr('');
            setAdminNote('');
            fetchWithdrawals();
        } catch {
            toast.error('Could not complete withdrawal');
        } finally {
            setActionLoading(false);
        }
    };

    const markReject = async () => {
        if (!rejectModal) return;
        setActionLoading(true);
        try {
            await api.put(`/withdrawals/${rejectModal.id}/reject`, {
                reason: rejectReason.trim() || 'Rejected by admin',
            }, { headers: authHeaders(token) });
            toast.success('Withdrawal rejected — beans refunded to user');
            setRejectModal(null);
            setRejectReason('');
            fetchWithdrawals();
        } catch {
            toast.error('Could not reject withdrawal');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Withdrawals"
                description="Manual payout queue — transfer via your UPI/bank app, then mark complete with UTR."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Withdrawals' }]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <StatCard
                    title="Pending Requests"
                    value={counts.pending}
                    icon={Clock}
                    colorClass="bg-amber-500/10 text-amber-400"
                    subtitle="Awaiting manual transfer"
                />
                <StatCard
                    title="Processing"
                    value={counts.processing}
                    icon={Banknote}
                    colorClass="bg-blue-500/10 text-blue-400"
                    subtitle="RazorpayX auto payouts"
                />
            </div>

            <div className="mb-6">
                <Tabs
                    tabs={statusTabs.map((t) => ({
                        ...t,
                        count: t.id === 'pending' && counts.pending > 0 ? counts.pending : undefined,
                    }))}
                    active={status}
                    onChange={(id) => { setStatus(id); setPage(1); }}
                />
            </div>

            <Card>
                {loading ? (
                    <TableSkeleton rows={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={IndianRupee}
                        title="No withdrawal requests"
                        description={status === 'pending'
                            ? 'When users request payouts, they appear here for manual transfer.'
                            : `No ${status} withdrawals found.`}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-dark-border">
                                    <th className="pb-3 pr-4 font-medium">User</th>
                                    <th className="pb-3 pr-4 font-medium">Amount</th>
                                    <th className="pb-3 pr-4 font-medium">Payout details</th>
                                    <th className="pb-3 pr-4 font-medium">Status</th>
                                    <th className="pb-3 pr-4 font-medium">Date</th>
                                    <th className="pb-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-border/60">
                                {rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.02]">
                                        <td className="py-4 pr-4">
                                            <p className="font-semibold text-white">{row.username || '—'}</p>
                                            <p className="text-xs text-gray-500">{row.crimzoId}</p>
                                            <p className="text-xs text-gray-600">{row.email}</p>
                                        </td>
                                        <td className="py-4 pr-4">
                                            <p className="text-lg font-bold text-crimzo">₹{formatNumber(row.amountInr)}</p>
                                            <p className="text-xs text-gray-500">{formatNumber(row.beansUsed)} beans</p>
                                        </td>
                                        <td className="py-4 pr-4 max-w-xs">
                                            <p className="text-white text-xs font-mono whitespace-pre-wrap break-all">
                                                {payoutDetailsText(row)}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => copyPayout(row)}
                                                className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-crimzo"
                                            >
                                                <Copy size={12} /> Copy
                                            </button>
                                        </td>
                                        <td className="py-4 pr-4">
                                            <Badge variant={statusVariant(row.status)} dot>
                                                {row.status}
                                            </Badge>
                                            {row.utr && (
                                                <p className="text-xs text-gray-500 mt-1">UTR: {row.utr}</p>
                                            )}
                                            {row.failureReason && (
                                                <p className="text-xs text-red-400 mt-1">{row.failureReason}</p>
                                            )}
                                        </td>
                                        <td className="py-4 pr-4 text-gray-400 text-xs">
                                            {formatDate(row.createdAt)}
                                            {row.completedAt && (
                                                <p className="text-emerald-500/80 mt-1">Done {formatDate(row.completedAt)}</p>
                                            )}
                                        </td>
                                        <td className="py-4 text-right">
                                            {['pending', 'processing'].includes(row.status) ? (
                                                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="primary"
                                                        onClick={() => {
                                                            setCompleteModal(row);
                                                            setUtr('');
                                                            setAdminNote('');
                                                        }}
                                                    >
                                                        <CheckCircle size={14} /> Complete
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        onClick={() => {
                                                            setRejectModal(row);
                                                            setRejectReason('');
                                                        }}
                                                    >
                                                        <XCircle size={14} /> Reject
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && totalPages > 1 && (
                    <div className="mt-6 pt-4 border-t border-dark-border">
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    </div>
                )}
            </Card>

            <Modal
                open={!!completeModal}
                onClose={() => setCompleteModal(null)}
                title="Mark withdrawal complete"
                description={completeModal
                    ? `Transfer ₹${completeModal.amountInr.toLocaleString('en-IN')} manually, then enter UTR/reference.`
                    : undefined}
                footer={(
                    <>
                        <Button variant="ghost" onClick={() => setCompleteModal(null)}>Cancel</Button>
                        <Button variant="primary" onClick={markComplete} loading={actionLoading} disabled={!utr.trim()}>
                            Mark completed
                        </Button>
                    </>
                )}
            >
                {completeModal && (
                    <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-dark-bg border border-dark-border text-xs font-mono whitespace-pre-wrap text-gray-300">
                            {payoutDetailsText(completeModal)}
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1.5">UTR / Transaction ID *</label>
                            <input
                                value={utr}
                                onChange={(e) => setUtr(e.target.value)}
                                placeholder="e.g. 123456789012"
                                className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-white focus:outline-none focus:border-crimzo"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1.5">Admin note (optional)</label>
                            <input
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                placeholder="Internal note"
                                className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-white focus:outline-none focus:border-crimzo"
                            />
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={!!rejectModal}
                onClose={() => setRejectModal(null)}
                title="Reject withdrawal"
                description="User's beans/diamonds will be refunded automatically."
                footer={(
                    <>
                        <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
                        <Button variant="danger" onClick={markReject} loading={actionLoading}>
                            Reject & refund
                        </Button>
                    </>
                )}
            >
                <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Reason</label>
                    <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Invalid bank details"
                        rows={3}
                        className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-white focus:outline-none focus:border-crimzo resize-none"
                    />
                </div>
            </Modal>
        </div>
    );
};

export default Withdrawals;