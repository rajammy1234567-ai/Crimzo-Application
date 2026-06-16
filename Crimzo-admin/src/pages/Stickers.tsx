import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Trash2, Image as ImageIcon, Gift } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatNumber } from '../lib/utils';
import type { Sticker } from '../types';

const CATEGORIES = ['fun', 'love', 'celebration', 'premium', 'special'] as const;

const Stickers = () => {
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<Sticker | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const { token } = useAuth();
    const toast = useToast();

    const [newSticker, setNewSticker] = useState({ name: '', emoji: '', price: 10, category: 'fun' as string });

    const fetchStickers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/stickers', { headers: authHeaders(token) });
            setStickers(res.data.stickers);
        } catch {
            toast.error('Failed to load stickers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStickers();
    }, [token]);

    const grouped = useMemo(() => {
        const map: Record<string, Sticker[]> = {};
        stickers.forEach(s => {
            const cat = s.category || 'other';
            if (!map[cat]) map[cat] = [];
            map[cat].push(s);
        });
        return map;
    }, [stickers]);

    const totalValue = stickers.reduce((s, st) => s + st.price, 0);

    const addSticker = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await api.post('/stickers', newSticker, { headers: authHeaders(token) });
            toast.success(`Sticker "${newSticker.name}" created`);
            setNewSticker({ name: '', emoji: '', price: 10, category: 'fun' });
            fetchStickers();
        } catch {
            toast.error('Failed to create sticker');
        } finally {
            setActionLoading(false);
        }
    };

    const deleteSticker = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        try {
            await api.delete(`/stickers/${deleteTarget.id || deleteTarget._id}`, {
                headers: authHeaders(token),
            });
            toast.success('Sticker deleted');
            setDeleteTarget(null);
            fetchStickers();
        } catch {
            toast.error('Failed to delete sticker');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Stickers & Gifts"
                description="Manage the gift economy — create stickers, set prices, and organize by category."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Stickers' }]}
                stats={[
                    { label: 'Total Items', value: stickers.length },
                    { label: 'Categories', value: Object.keys(grouped).length },
                    { label: 'Avg Price', value: stickers.length ? `${Math.round(totalValue / stickers.length)} 💎` : '—' },
                ]}
            />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:sticky xl:top-20 xl:self-start">
                    <CardHeader title="Create Sticker" description="Add a new gift to the store" icon={<Plus size={18} />} />
                    <form onSubmit={addSticker} className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">Name</label>
                            <input
                                required
                                value={newSticker.name}
                                onChange={e => setNewSticker({ ...newSticker, name: e.target.value })}
                                type="text"
                                className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-crimzo/50"
                                placeholder="e.g. Magic Wand"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">Emoji</label>
                                <input
                                    required
                                    value={newSticker.emoji}
                                    onChange={e => setNewSticker({ ...newSticker, emoji: e.target.value })}
                                    type="text"
                                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-crimzo/50"
                                    placeholder="🪄"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">Price 💎</label>
                                <input
                                    required
                                    value={newSticker.price}
                                    onChange={e => setNewSticker({ ...newSticker, price: Number(e.target.value) })}
                                    min={1}
                                    type="number"
                                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-crimzo/50"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">Category</label>
                            <select
                                value={newSticker.category}
                                onChange={e => setNewSticker({ ...newSticker, category: e.target.value })}
                                className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-crimzo/50"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <Button type="submit" loading={actionLoading} className="w-full" icon={<Plus size={16} />}>
                            Create Sticker
                        </Button>
                    </form>
                </Card>

                <div className="xl:col-span-2 space-y-6">
                    {loading ? (
                        <LoadingSpinner message="Loading catalog..." />
                    ) : stickers.length === 0 ? (
                        <Card>
                            <EmptyState icon={Gift} title="No stickers yet" description="Create your first sticker using the form" />
                        </Card>
                    ) : (
                        Object.entries(grouped).map(([category, items]) => (
                            <Card key={category} padding={false}>
                                <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ImageIcon size={16} className="text-crimzo" />
                                        <h3 className="font-semibold text-white capitalize">{category}</h3>
                                    </div>
                                    <span className="text-xs text-gray-500">{items.length} items</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
                                    {items.map(sticker => (
                                        <div
                                            key={sticker.id || sticker._id}
                                            className="bg-dark-bg border border-dark-border rounded-xl p-4 text-center relative group hover:border-crimzo/30 transition-colors"
                                        >
                                            <button
                                                onClick={() => setDeleteTarget(sticker)}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                            <div className="text-4xl mb-2">{sticker.emoji}</div>
                                            <p className="text-sm font-semibold text-white truncate">{sticker.name}</p>
                                            <p className="text-xs text-crimzo font-bold mt-1">{formatNumber(sticker.price)} 💎</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            <Modal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Sticker"
                description="This sticker will be permanently removed from the store."
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="danger" loading={actionLoading} onClick={deleteSticker} icon={<Trash2 size={16} />}>
                            Delete
                        </Button>
                    </>
                }
            >
                {deleteTarget && (
                    <div className="flex items-center gap-4 p-4 bg-dark-bg rounded-xl border border-dark-border">
                        <span className="text-4xl">{deleteTarget.emoji}</span>
                        <div>
                            <p className="font-semibold text-white">{deleteTarget.name}</p>
                            <p className="text-sm text-crimzo">{deleteTarget.price} 💎</p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Stickers;