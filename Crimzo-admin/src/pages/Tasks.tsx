import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Trash2, ListChecks } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';

type Task = {
  _id?: string;
  id?: string;
  key: string;
  title: string;
  section: 'newbie' | 'daily' | 'monthly';
  reward_type: 'beans' | 'diamonds';
  reward_amount: number;
  max_count: number;
  action_type: string;
  action_target: number;
  deep_link: string;
  is_active: boolean;
  sort_order: number;
};

const emptyTask = (): Task => ({
  key: '',
  title: '',
  section: 'daily',
  reward_type: 'beans',
  reward_amount: 10,
  max_count: 1,
  action_type: 'manual',
  action_target: 1,
  deep_link: '/(tabs)/home',
  is_active: true,
  sort_order: 0,
});

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<Task>(emptyTask());
  const [actionLoading, setActionLoading] = useState(false);
  const { token } = useAuth();
  const toast = useToast();

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', { headers: authHeaders(token) });
      setTasks(res.data.tasks || []);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyTask());
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({ ...task });
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editing) {
        const id = editing._id || editing.id;
        await api.put(`/tasks/${id}`, form, { headers: authHeaders(token) });
        toast.success('Task updated');
      } else {
        await api.post('/tasks', form, { headers: authHeaders(token) });
        toast.success('Task created');
      }
      setEditing(null);
      setForm(emptyTask());
      fetchTasks();
    } catch {
      toast.error('Failed to save task');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteTask = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const id = deleteTarget._id || deleteTarget.id;
      await api.delete(`/tasks/${id}`, { headers: authHeaders(token) });
      toast.success('Task deleted');
      setDeleteTarget(null);
      fetchTasks();
    } catch {
      toast.error('Failed to delete task');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Tasks"
        description="Create tasks shown to all users. Set bean or diamond rewards and action rules."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tasks' }]}
        stats={[
          { label: 'Total Tasks', value: tasks.length },
          { label: 'Active', value: tasks.filter((t) => t.is_active).length },
          { label: 'Diamond Rewards', value: tasks.filter((t) => t.reward_type === 'diamonds').length },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:sticky xl:top-20 xl:self-start">
          <CardHeader
            title={editing ? 'Edit Task' : 'Create Task'}
            description="Tasks appear in user My Tasks panel"
            icon={<Plus size={18} />}
          />
          <form onSubmit={saveTask} className="space-y-3">
            <input
              required
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="unique_key"
              disabled={!!editing}
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm"
            />
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Task title"
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value as Task['section'] })}
                className="bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
              >
                <option value="newbie">Newbie</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
              <select
                value={form.reward_type}
                onChange={(e) => setForm({ ...form, reward_type: e.target.value as Task['reward_type'] })}
                className="bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
              >
                <option value="beans">Beans</option>
                <option value="diamonds">Diamonds</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={form.reward_amount}
                onChange={(e) => setForm({ ...form, reward_amount: Number(e.target.value) })}
                placeholder="Reward"
                className="bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
              />
              <input
                type="number"
                value={form.max_count}
                onChange={(e) => setForm({ ...form, max_count: Number(e.target.value) })}
                placeholder="Max count"
                className="bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
              />
            </div>
            <select
              value={form.action_type}
              onChange={(e) => setForm({ ...form, action_type: e.target.value })}
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
            >
              <option value="manual">Manual (Go button)</option>
              <option value="spend_diamonds">Spend diamonds</option>
              <option value="buy_diamonds">Buy / top up</option>
              <option value="send_gift">Send gift</option>
              <option value="watch_live">Watch live</option>
            </select>
            <input
              type="number"
              value={form.action_target}
              onChange={(e) => setForm({ ...form, action_target: Number(e.target.value) })}
              placeholder="Action target (e.g. 50 diamonds)"
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
            />
            <input
              value={form.deep_link}
              onChange={(e) => setForm({ ...form, deep_link: e.target.value })}
              placeholder="Deep link e.g. /profile/wallet"
              className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-white text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active (visible to users)
            </label>
            <Button type="submit" loading={actionLoading} className="w-full">
              {editing ? 'Update Task' : 'Create Task'}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" className="w-full" onClick={openCreate}>
                Cancel edit
              </Button>
            )}
          </form>
        </Card>

        <div className="xl:col-span-2">
          <Card>
            <CardHeader title="All Tasks" icon={<ListChecks size={18} />} />
            {loading ? (
              <LoadingSpinner />
            ) : tasks.length === 0 ? (
              <EmptyState icon={ListChecks} title="No tasks yet" description="Create your first task" />
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task._id || task.id || task.key}
                    className="flex items-center justify-between p-4 rounded-xl bg-dark-bg border border-dark-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {task.section} · {task.key} · {task.action_type}
                        {task.action_target > 1 ? ` (${task.action_target})` : ''}
                      </p>
                      <p className="text-sm text-crimzo mt-1">
                        {task.reward_type} {task.reward_amount} x {task.max_count}
                        {!task.is_active && ' · inactive'}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-3">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(task)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(task)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete task?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={actionLoading} onClick={deleteTask}>Delete</Button>
          </>
        }
      >
        <p className="text-gray-400">Remove &quot;{deleteTarget?.title}&quot; from all users?</p>
      </Modal>
    </div>
  );
};

export default Tasks;