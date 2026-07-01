import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Trash2, Crown } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatNumber } from '../lib/utils';

type LevelRow = {
  id?: string;
  _id?: string;
  level_number: number;
  name: string;
  description?: string;
  price_diamonds: number;
  showcase_type: string;
  showcase_emoji: string;
  showcase_image_url?: string | null;
  showcase_model_key?: string | null;
  badge_color: string;
  is_default?: boolean;
  sort_order?: number;
  is_active?: boolean;
};

const SHOWCASE_TYPES = ['scooter', 'bike', 'car', 'rath', 'supercar', 'yacht', 'jet', 'throne'] as const;

const emptyForm = (): Partial<LevelRow> => ({
  level_number: 1,
  name: '',
  description: '',
  price_diamonds: 0,
  showcase_type: 'scooter',
  showcase_emoji: '🛵',
  badge_color: '#FF2D55',
  sort_order: 0,
  is_active: true,
});

const Levels = () => {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LevelRow | null>(null);
  const [form, setForm] = useState<Partial<LevelRow>>(emptyForm());
  const { token } = useAuth();
  const toast = useToast();

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const res = await api.get('/levels', { headers: authHeaders(token) });
      setLevels(res.data.levels || []);
    } catch {
      toast.error('Failed to load levels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLevels();
  }, [token]);

  const addLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.level_number) {
      toast.error('Name and level number required');
      return;
    }
    setActionLoading(true);
    try {
      await api.post('/levels', form, { headers: authHeaders(token) });
      toast.success(`Level ${form.level_number} created`);
      setForm(emptyForm());
      await fetchLevels();
    } catch {
      toast.error('Failed to create level');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteLevel = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id || deleteTarget._id;
    if (!id) return;
    setActionLoading(true);
    try {
      await api.delete(`/levels/${id}`, { headers: authHeaders(token) });
      toast.success('Level deleted');
      setDeleteTarget(null);
      await fetchLevels();
    } catch {
      toast.error('Failed to delete level');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="User Levels"
        description="Manage the sequential level ladder — prices in diamonds, showcase items per level."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Levels' }]}
        stats={[
          { label: 'Total Levels', value: levels.length },
          { label: 'Max Price', value: levels.length ? `${formatNumber(Math.max(...levels.map((l) => l.price_diamonds)))} 💎` : '—' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader title="Add Level" description="Sequential ladder — Level 1 should stay free/default" />
          <form onSubmit={addLevel} className="space-y-3 p-4 pt-0">
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Level number"
              type="number"
              min={1}
              value={form.level_number ?? 1}
              onChange={(e) => setForm({ ...form, level_number: Number(e.target.value) })}
            />
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Name (e.g. Royal)"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Description"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Price (diamonds)"
              type="number"
              min={0}
              value={form.price_diamonds ?? 0}
              onChange={(e) => setForm({ ...form, price_diamonds: Number(e.target.value) })}
            />
            <select
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              value={form.showcase_type || 'scooter'}
              onChange={(e) => setForm({ ...form, showcase_type: e.target.value })}
            >
              {SHOWCASE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Showcase emoji"
              value={form.showcase_emoji || ''}
              onChange={(e) => setForm({ ...form, showcase_emoji: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="3D model key (e.g. golf_gti)"
              value={form.showcase_model_key || ''}
              onChange={(e) => setForm({ ...form, showcase_model_key: e.target.value || null })}
            />
            <input
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              placeholder="Badge color (#FF2D55)"
              value={form.badge_color || '#FF2D55'}
              onChange={(e) => setForm({ ...form, badge_color: e.target.value })}
            />
            <Button type="submit" disabled={actionLoading}>
              <Plus className="w-4 h-4 mr-1" /> Create Level
            </Button>
          </form>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Level Catalog" description="Users unlock sequentially with diamonds" />
          {loading ? (
            <LoadingSpinner />
          ) : levels.length === 0 ? (
            <EmptyState icon={Crown} title="No levels yet" description="Seed runs on backend boot, or add manually." />
          ) : (
            <div className="divide-y divide-gray-800">
              {levels.map((level) => (
                <div key={level.id || level._id || level.level_number} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.showcase_emoji}</span>
                    <div>
                      <p className="text-white font-semibold">
                        L{level.level_number} · {level.name}
                        {level.is_default ? <span className="ml-2 text-xs text-amber-400">DEFAULT</span> : null}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {level.description || level.showcase_type}
                        {level.showcase_model_key ? ` · 3D: ${level.showcase_model_key}` : ''}
                      </p>
                      <p className="text-cyan-400 text-xs font-medium">{formatNumber(level.price_diamonds)} 💎</p>
                    </div>
                  </div>
                  {!level.is_default && level.level_number !== 1 ? (
                    <button
                      type="button"
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(level)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Level"
        description="This level will be removed from the shop catalog."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={deleteLevel} disabled={actionLoading}>Delete</Button>
          </>
        )}
      >
        {deleteTarget ? (
          <p className="text-gray-300 text-sm">
            Delete Level {deleteTarget.level_number} — {deleteTarget.name}?
          </p>
        ) : null}
      </Modal>
    </div>
  );
};

export default Levels;