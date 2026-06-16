import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Trash2, Heart, MessageCircle, Eye, Film, Play } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { CardGridSkeleton } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, formatNumber } from '../lib/utils';
import type { Reel } from '../types';

const Reels = () => {
    const [reels, setReels] = useState<Reel[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<Reel | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [previewReel, setPreviewReel] = useState<Reel | null>(null);
    const { token } = useAuth();
    const toast = useToast();

    const fetchReels = async () => {
        setLoading(true);
        try {
            const res = await api.get('/reels', { headers: authHeaders(token) });
            setReels(res.data.reels);
        } catch {
            toast.error('Failed to load reels');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReels();
    }, [token]);

    const deleteReel = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        try {
            await api.delete(`/reels/${deleteTarget.id || deleteTarget._id}`, {
                headers: authHeaders(token),
            });
            toast.success('Reel deleted successfully');
            setDeleteTarget(null);
            fetchReels();
        } catch {
            toast.error('Failed to delete reel');
        } finally {
            setActionLoading(false);
        }
    };

    const totalEngagement = reels.reduce((s, r) => s + (r.likes_count || 0) + (r.comments_count || 0), 0);

    return (
        <div>
            <PageHeader
                title="Reels Moderation"
                description="Review user-generated reels. Delete inappropriate or policy-violating content."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Reels' }]}
                stats={[
                    { label: 'Total Reels', value: reels.length },
                    { label: 'Total Engagement', value: formatNumber(totalEngagement) },
                ]}
            />

            {loading ? (
                <CardGridSkeleton count={8} />
            ) : reels.length === 0 ? (
                <Card>
                    <EmptyState icon={Film} title="No reels yet" description="User reels will appear here for moderation" />
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {reels.map(reel => (
                        <Card key={reel.id || reel._id} padding={false} className="overflow-hidden flex flex-col">
                            <div className="flex items-center gap-3 p-3 border-b border-dark-border bg-dark-bg/40">
                                {reel.user_id?.avatar ? (
                                    <img src={reel.user_id.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-dark-border" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-crimzo/15 flex items-center justify-center text-crimzo text-xs font-bold">
                                        {reel.username?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">@{reel.username}</p>
                                    <p className="text-[10px] text-gray-600 font-mono">{reel.crimzo_id}</p>
                                </div>
                                <span className="text-[10px] text-gray-600">{formatDate(reel.created_at)}</span>
                            </div>

                            <div
                                className="h-56 bg-black relative cursor-pointer group/media"
                                onClick={() => setPreviewReel(reel)}
                            >
                                {reel.thumbnail_url ? (
                                    <img src={reel.thumbnail_url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <video src={reel.video_url} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center">
                                    <Play size={32} className="text-white" />
                                </div>
                            </div>

                            <div className="p-3 flex-1 flex flex-col">
                                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                                    <div className="flex gap-3">
                                        <span className="flex items-center gap-1"><Heart size={12} className="text-crimzo" /> {reel.likes_count || 0}</span>
                                        <span className="flex items-center gap-1"><MessageCircle size={12} /> {reel.comments_count || 0}</span>
                                    </div>
                                    <span className="flex items-center gap-1"><Eye size={12} /> {reel.views_count || 0}</span>
                                </div>
                                {reel.caption && (
                                    <p className="text-xs text-gray-500 line-clamp-2 flex-1">{reel.caption}</p>
                                )}
                                <Button
                                    variant="danger"
                                    size="sm"
                                    className="w-full mt-3"
                                    onClick={() => setDeleteTarget(reel)}
                                    icon={<Trash2 size={14} />}
                                >
                                    Delete Reel
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Reel"
                description="This action is permanent. The reel, its likes, and comments will be removed."
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="danger" loading={actionLoading} onClick={deleteReel} icon={<Trash2 size={16} />}>
                            Delete Permanently
                        </Button>
                    </>
                }
            >
                {deleteTarget && (
                    <div className="p-4 bg-dark-bg rounded-xl border border-dark-border">
                        <p className="text-sm text-white">Reel by <span className="text-crimzo font-medium">@{deleteTarget.username}</span></p>
                        {deleteTarget.caption && <p className="text-xs text-gray-500 mt-2 line-clamp-3">{deleteTarget.caption}</p>}
                    </div>
                )}
            </Modal>

            <Modal
                open={!!previewReel}
                onClose={() => setPreviewReel(null)}
                title={`Reel by @${previewReel?.username}`}
                size="lg"
            >
                {previewReel && (
                    <div className="space-y-4">
                        <video src={previewReel.video_url} className="w-full max-h-[60vh] rounded-xl bg-black" controls autoPlay />
                        {previewReel.caption && <p className="text-sm text-gray-400">{previewReel.caption}</p>}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Reels;