import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { IndianRupee, Video, MessageCircle, Save, ToggleLeft, ToggleRight, Coins, Users } from 'lucide-react';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { LoadingSpinner } from '../components/ui/LoadingState';
import type { BillingSettings, BillingStats, BillingSessionRow, UserEarningsRow, OwnerEarnings } from '../types';
import { formatNumber } from '../lib/utils';

const Billing = () => {
    const { token } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<BillingSettings | null>(null);
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [sessions, setSessions] = useState<{ videoCalls: BillingSessionRow[]; liveTalks: BillingSessionRow[] }>({
        videoCalls: [],
        liveTalks: [],
    });
    const [userEarnings, setUserEarnings] = useState<UserEarningsRow[]>([]);
    const [ownerEarnings, setOwnerEarnings] = useState<OwnerEarnings | null>(null);

    const [videoRate, setVideoRate] = useState('1');
    const [liveRate, setLiveRate] = useState('1');
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [liveEnabled, setLiveEnabled] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [settingsRes, sessionsRes] = await Promise.all([
                api.get('/billing/settings', { headers: authHeaders(token) }),
                api.get('/billing/sessions', { headers: authHeaders(token), params: { type: 'all' } }),
            ]);
            const s = settingsRes.data.settings as BillingSettings;
            const st = settingsRes.data.stats as BillingStats;
            setSettings(s);
            setStats(st);
            setVideoRate(String(s.video_call_rate_per_min_inr ?? 1));
            setLiveRate(String(s.live_talk_rate_per_min_inr ?? 1));
            setVideoEnabled(s.video_call_billing_enabled !== false);
            setLiveEnabled(s.live_talk_billing_enabled !== false);
            setSessions({
                videoCalls: sessionsRes.data.videoCalls || [],
                liveTalks: sessionsRes.data.liveTalks || [],
            });
            setUserEarnings(settingsRes.data.userEarnings || []);
            setOwnerEarnings(settingsRes.data.ownerEarnings || null);
        } catch {
            toast.error('Failed to load billing settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

    const saveSettings = async () => {
        setSaving(true);
        try {
            await api.put('/billing/settings', {
                video_call_rate_per_min_inr: Number(videoRate),
                live_talk_rate_per_min_inr: Number(liveRate),
                video_call_billing_enabled: videoEnabled,
                live_talk_billing_enabled: liveEnabled,
            }, { headers: authHeaders(token) });
            toast.success('Billing settings saved — changes apply immediately in the app');
            fetchData();
        } catch {
            toast.error('Could not save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingSpinner message="Loading billing settings..." />;

    return (
        <div>
            <PageHeader
                title="Billing & Rates"
                description="Control ₹/min rates for video calls and live talk. 70% beans go to the host/callee, 30% stays with platform (owner)."
                breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Billing' }]}
            />

            {ownerEarnings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        title="Owner Platform Beans"
                        value={ownerEarnings.totalPlatformBeans}
                        icon={Coins}
                        colorClass="bg-emerald-500/10 text-emerald-400"
                        subtitle={`${Math.round((ownerEarnings.platformShare || 0.3) * 100)}% of all paid minutes`}
                    />
                    <StatCard
                        title="Owner — Video Calls"
                        value={ownerEarnings.videoCallPlatformBeans}
                        icon={Video}
                        colorClass="bg-blue-500/10 text-blue-400"
                        subtitle="Platform share from 1-on-1 calls"
                    />
                    <StatCard
                        title="Owner — Live Talk"
                        value={ownerEarnings.liveTalkPlatformBeans}
                        icon={MessageCircle}
                        colorClass="bg-amber-500/10 text-amber-400"
                        subtitle="Platform share from live chat"
                    />
                    <StatCard
                        title="Users Total Earned"
                        value={stats?.totalUserBeansEarned || 0}
                        icon={Users}
                        colorClass="bg-purple-500/10 text-purple-400"
                        subtitle={`${Math.round((ownerEarnings.receiverShare || 0.7) * 100)}% to hosts/callees`}
                    />
                </div>
            )}

            {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        title="Video Call Revenue"
                        value={stats.videoCallRevenue}
                        icon={Video}
                        colorClass="bg-blue-500/10 text-blue-400"
                        subtitle={`₹ total · ${stats.videoCallSessions} sessions`}
                    />
                    <StatCard
                        title="Live Talk Revenue"
                        value={stats.liveTalkRevenue}
                        icon={MessageCircle}
                        colorClass="bg-amber-500/10 text-amber-400"
                        subtitle={`₹ total · ${stats.liveTalkSessions} sessions`}
                    />
                    <StatCard
                        title="Pending Talk Requests"
                        value={stats.pendingTalkRequests}
                        icon={IndianRupee}
                        colorClass="bg-purple-500/10 text-purple-400"
                        subtitle="Hosts waiting to accept"
                    />
                    <StatCard
                        title="Total Billed Minutes"
                        value={stats.videoCallMinutes + stats.liveTalkMinutes}
                        icon={IndianRupee}
                        colorClass="bg-crimzo/10 text-crimzo"
                        subtitle="Video + live talk"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                <Card padding>
                    <CardHeader title="Video Call (1-on-1)" description="Caller pays from wallet balance" icon={<Video size={18} />} />
                    <div className="space-y-4 mt-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Rate per minute (₹)</label>
                            <input
                                type="number"
                                min={0}
                                max={10000}
                                step={1}
                                value={videoRate}
                                onChange={e => setVideoRate(e.target.value)}
                                className="mt-1 w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:border-crimzo outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setVideoEnabled(v => !v)}
                            className="flex items-center gap-3 w-full p-3 rounded-xl border border-dark-border hover:border-crimzo/30 transition-colors"
                        >
                            {videoEnabled
                                ? <ToggleRight size={28} className="text-emerald-400" />
                                : <ToggleLeft size={28} className="text-gray-500" />}
                            <div className="text-left">
                                <p className="text-sm font-semibold text-white">Wallet billing {videoEnabled ? 'ON' : 'OFF'}</p>
                                <p className="text-xs text-gray-500">OFF = video calls allowed without wallet recharge</p>
                            </div>
                        </button>
                    </div>
                </Card>

                <Card padding>
                    <CardHeader title="Live Talk (Popular Live)" description="Viewers chat with host after request + accept" icon={<MessageCircle size={18} />} />
                    <div className="space-y-4 mt-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Rate per minute (₹)</label>
                            <input
                                type="number"
                                min={0}
                                max={10000}
                                step={1}
                                value={liveRate}
                                onChange={e => setLiveRate(e.target.value)}
                                className="mt-1 w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:border-crimzo outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setLiveEnabled(v => !v)}
                            className="flex items-center gap-3 w-full p-3 rounded-xl border border-dark-border hover:border-crimzo/30 transition-colors"
                        >
                            {liveEnabled
                                ? <ToggleRight size={28} className="text-emerald-400" />
                                : <ToggleLeft size={28} className="text-gray-500" />}
                            <div className="text-left">
                                <p className="text-sm font-semibold text-white">Wallet billing {liveEnabled ? 'ON' : 'OFF'}</p>
                                <p className="text-xs text-gray-500">OFF = request/accept only, no ₹ charge</p>
                            </div>
                        </button>
                    </div>
                </Card>
            </div>

            <div className="flex justify-end mb-8">
                <Button loading={saving} onClick={saveSettings} icon={<Save size={16} />}>
                    Save Billing Settings
                </Button>
            </div>

            <Card padding className="mb-8">
                <CardHeader
                    title="User Earnings (Hosts & Callees)"
                    description="Per-user beans earned from video calls and live talk — 70% of each paid minute"
                    icon={<Users size={18} />}
                />
                <div className="mt-4 overflow-x-auto">
                    {userEarnings.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">No user earnings recorded yet</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-dark-border">
                                    <th className="pb-3 pr-4">User</th>
                                    <th className="pb-3 pr-4">Video Call</th>
                                    <th className="pb-3 pr-4">Live Talk</th>
                                    <th className="pb-3 pr-4">Total Beans</th>
                                    <th className="pb-3">Revenue (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userEarnings.map(row => (
                                    <tr key={row.userId} className="border-b border-dark-border/50 hover:bg-white/[0.02]">
                                        <td className="py-3 pr-4">
                                            <p className="font-semibold text-white">@{row.username || '—'}</p>
                                            <p className="text-xs text-gray-500">{row.crimzoId || row.userId}</p>
                                        </td>
                                        <td className="py-3 pr-4 text-blue-300">
                                            {formatNumber(row.videoCallBeans)} beans
                                            <span className="block text-xs text-gray-500">{row.videoCallSessions} sessions</span>
                                        </td>
                                        <td className="py-3 pr-4 text-amber-300">
                                            {formatNumber(row.liveTalkBeans)} beans
                                            <span className="block text-xs text-gray-500">{row.liveTalkSessions} sessions</span>
                                        </td>
                                        <td className="py-3 pr-4 font-bold text-emerald-400">{formatNumber(row.totalBeans)}</td>
                                        <td className="py-3 text-amber-400">₹{formatNumber(row.totalRevenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card padding>
                    <CardHeader title="Recent Video Calls" description="Wallet charges · 70% callee / 30% owner" />
                    <div className="mt-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                        {sessions.videoCalls.length === 0 ? (
                            <p className="text-sm text-gray-500 py-6 text-center">No video call sessions yet</p>
                        ) : sessions.videoCalls.map(row => (
                            <div key={row.id} className="p-3 rounded-xl bg-dark-bg border border-dark-border text-sm">
                                <div className="flex justify-between">
                                    <span className="font-semibold text-white">@{row.payer || 'User'}</span>
                                    <span className="text-amber-400 font-bold">₹{row.totalCharged}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Callee: @{row.peer || '—'} · {row.minutesCharged} min · ₹{row.ratePerMin}/min
                                </p>
                                <p className="text-xs mt-1">
                                    <span className="text-emerald-400">{formatNumber(row.receiverBeans || 0)} beans → callee</span>
                                    <span className="text-gray-600 mx-1">·</span>
                                    <span className="text-amber-400">{formatNumber(row.platformBeans || 0)} beans → owner</span>
                                    <span className="text-gray-600 ml-1">· {row.status}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card padding>
                    <CardHeader title="Recent Live Talks" description="Popular live chat · 70% host / 30% owner" />
                    <div className="mt-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                        {sessions.liveTalks.length === 0 ? (
                            <p className="text-sm text-gray-500 py-6 text-center">No live talk sessions yet</p>
                        ) : sessions.liveTalks.map(row => (
                            <div key={row.id} className="p-3 rounded-xl bg-dark-bg border border-dark-border text-sm">
                                <div className="flex justify-between">
                                    <span className="font-semibold text-white">@{row.talker || 'Viewer'}</span>
                                    <span className="text-amber-400 font-bold">₹{row.totalCharged}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Host: @{row.host || '—'} · {row.minutesCharged} min · ₹{row.ratePerMin}/min
                                </p>
                                <p className="text-xs mt-1">
                                    <span className="text-emerald-400">{formatNumber(row.receiverBeans || 0)} beans → host</span>
                                    <span className="text-gray-600 mx-1">·</span>
                                    <span className="text-amber-400">{formatNumber(row.platformBeans || 0)} beans → owner</span>
                                    <span className="text-gray-600 ml-1">· {row.status}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {settings?.updated_at && (
                <p className="text-xs text-gray-600 mt-6 text-center">
                    Last updated: {new Date(settings.updated_at).toLocaleString('en-IN')}
                </p>
            )}
        </div>
    );
};

export default Billing;