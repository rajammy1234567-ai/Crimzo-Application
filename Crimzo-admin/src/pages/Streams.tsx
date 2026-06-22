import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { RadioReceiver, AlertOctagon, Radio, Eye, Clock } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { CardGridSkeleton } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateTime, formatRelativeTime } from '../lib/utils';
import type { Stream } from '../types';

const Streams = () => {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [statusFilter, setStatusFilter] = useState<'active' | 'ended'>('active');
    const [loading, setLoading] = useState(true);
    const [terminateTarget, setTerminateTarget] = useState<Stream | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const { token } = useAuth();
    const toast = useToast();

    const fetchStreams = async () => {
        setLoading(true);
        try {
            const res = await api.get('/streams', {
                headers: authHeaders(token),
                params: { status: statusFilter },
            });
            setStreams(res.data.streams);
        } catch {
            toast.error('Failed to load streams');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStreams();
        const interval = statusFilter === 'active' ? setInterval(fetchStreams, 30000) : undefined;
        return () => { if (interval) clearInterval(interval); };
    }, [statusFilter, token]);

    const terminateStream = async () => {
        if (!terminateTarget) return;
        setActionLoading(true);
        try {
            await api.put(`/streams/${terminateTarget.id || terminateTarget._id}/terminate`, {}, {
                headers: authHeaders(token),
            });
            toast.success(`Stream by @${terminateTarget.username} terminated`);
            setTerminateTarget(null);
            fetchStreams();
        } catch {
            toast.error('Failed to terminate stream');
        } finally {
            setActionLoading(false);
        }
    };

    const activeCount = statusFilter === 'active' ? streams.length : 0;

    return (
        <div>
            <PageHeader
                title="Live Streams"
                description="Monitor active broadcasts. Viewers host se baat karne ke liye request bhejte hain — rate admin Billing se set hoti hai."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Streams' }]}
                stats={statusFilter === 'active' ? [
                    { label: 'Live Now', value: activeCount, color: 'text-red-400' },
                ] : undefined}
                action={
                    <Tabs
                        tabs={[
                            { id: 'active', label: 'Active' },
                            { id: 'ended', label: 'Ended' },
                        ]}
                        active={statusFilter}
                        onChange={id => setStatusFilter(id as 'active' | 'ended')}
                    />
                }
            />

            {loading ? (
                <CardGridSkeleton count={6} />
            ) : streams.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={Radio}
                        title={`No ${statusFilter} streams`}
                        description={statusFilter === 'active' ? 'No one is live right now' : 'No ended streams to show'}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {streams.map(stream => (
                        <Card key={stream.id || stream._id} padding={false} className="overflow-hidden group">
                            <div className="h-36 bg-gradient-to-br from-dark-bg to-dark-card flex items-center justify-center relative">
                                {stream.avatar ? (
                                    <img src={stream.avatar} alt="" className="w-20 h-20 rounded-full border-2 border-crimzo/50 object-cover" />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                        <RadioReceiver size={32} className="text-gray-600" />
                                    </div>
                                )}
                                {stream.status === 'active' && (
                                    <div className="absolute top-3 left-3">
                                        <Badge variant="live" dot>LIVE</Badge>
                                    </div>
                                )}
                                {stream.status === 'ended' && (
                                    <div className="absolute top-3 left-3">
                                        <Badge variant="neutral">Ended</Badge>
                                    </div>
                                )}
                                <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1 bg-black/50 backdrop-blur px-2 py-1 rounded-lg text-xs text-gray-300">
                                        <Eye size={12} /> {stream.viewers_count}
                                    </div>
                                    {stream.talk_rate_per_min != null && (
                                        <div className="bg-amber-500/20 border border-amber-500/30 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold text-amber-300">
                                            Talk ₹{stream.talk_rate_per_min}/min
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 space-y-3">
                                <div>
                                    <span className="text-[10px] font-mono text-gray-600 bg-dark-bg px-2 py-0.5 rounded">
                                        {stream.crimzo_id}
                                    </span>
                                    <h3 className="font-bold text-white mt-2 truncate">@{stream.username}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">Channel: {stream.channel_name}</p>
                                </div>

                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {formatRelativeTime(stream.started_at)}
                                    </span>
                                    <span>{formatDateTime(stream.started_at)}</span>
                                </div>

                                {stream.status === 'active' && (
                                    <Button
                                        variant="danger"
                                        size="md"
                                        className="w-full mt-1"
                                        onClick={() => setTerminateTarget(stream)}
                                        icon={<AlertOctagon size={16} />}
                                    >
                                        Force Terminate
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                open={!!terminateTarget}
                onClose={() => setTerminateTarget(null)}
                title="Terminate Live Stream"
                description="This will immediately end the broadcast and disconnect the host."
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setTerminateTarget(null)}>Cancel</Button>
                        <Button variant="danger" loading={actionLoading} onClick={terminateStream} icon={<AlertOctagon size={16} />}>
                            Terminate Stream
                        </Button>
                    </>
                }
            >
                {terminateTarget && (
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                        <p className="text-sm text-white font-medium">@{terminateTarget.username}</p>
                        <p className="text-xs text-gray-500 mt-1">Channel: {terminateTarget.channel_name}</p>
                        <p className="text-xs text-gray-500">Viewers: {terminateTarget.viewers_count}</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Streams;