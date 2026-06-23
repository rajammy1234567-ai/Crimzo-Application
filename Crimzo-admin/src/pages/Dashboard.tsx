import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, Radio, Film, Diamond, ArrowRight, TrendingUp, IndianRupee, Video, MessageCircle, Banknote, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardHeader } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingState';
import type { DashboardStats, ChartDataPoint } from '../types';
import { formatNumber } from '../lib/utils';

const quickLinks = [
    { to: '/withdrawals', label: 'Withdrawals', desc: 'Review & approve payout requests', color: 'text-amber-400', highlightKey: 'withdrawals' as const },
    { to: '/users', label: 'Manage Users', desc: 'Ban, search, adjust diamonds', color: 'text-blue-400' },
    { to: '/streams', label: 'Live Streams', desc: 'Monitor & terminate active streams', color: 'text-red-400' },
    { to: '/reels', label: 'Reels Moderation', desc: 'Review & remove content', color: 'text-purple-400' },
    { to: '/stickers', label: 'Stickers Store', desc: 'Diamond gifts economy', color: 'text-amber-400' },
    { to: '/billing', label: 'Billing & Rates', desc: 'Video call + live talk ₹/min', color: 'text-emerald-400' },
];

const Dashboard = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.get('/dashboard', { headers: authHeaders(token) });
                setStats(res.data.stats);
                setChartData(res.data.chartData || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [token]);

    if (loading) return <LoadingSpinner message="Loading dashboard..." />;
    if (!stats) {
        return (
            <div className="text-center py-20">
                <p className="text-red-400 font-medium">Failed to load dashboard</p>
                <p className="text-gray-500 text-sm mt-1">Check backend connection and try again</p>
            </div>
        );
    }

    const weekSignups = chartData.reduce((sum, d) => sum + d.count, 0);

    return (
        <div>
            <PageHeader
                title="Platform Overview"
                description="Real-time snapshot of Crimzo platform health — users, streams, content, and economy."
                breadcrumbs={[{ label: 'Dashboard' }]}
            />

            {(stats.pendingWithdrawals ?? 0) > 0 && (
                <button
                    type="button"
                    onClick={() => navigate('/withdrawals')}
                    className="w-full mb-6 flex items-center justify-between gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-colors text-left"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                            <AlertTriangle size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-amber-200">
                                {stats.pendingWithdrawals} withdrawal request{(stats.pendingWithdrawals ?? 0) === 1 ? '' : 's'} waiting
                            </p>
                            <p className="text-xs text-amber-400/80 mt-0.5">
                                Users have requested payouts — review UPI/bank details and mark complete after transfer.
                            </p>
                        </div>
                    </div>
                    <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-300">
                        Review now <ArrowRight size={14} />
                    </span>
                </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Total Users"
                    value={stats.totalUsers}
                    icon={Users}
                    colorClass="bg-blue-500/10 text-blue-400"
                    subtitle="Registered accounts"
                    trend={weekSignups > 0 ? { value: weekSignups, label: 'new this week' } : undefined}
                    onClick={() => navigate('/users')}
                />
                <StatCard
                    title="Active Streams"
                    value={stats.activeStreams}
                    icon={Radio}
                    colorClass="bg-red-500/10 text-red-400"
                    subtitle="Live right now"
                    onClick={() => navigate('/streams')}
                />
                <StatCard
                    title="Total Reels"
                    value={stats.totalReels}
                    icon={Film}
                    colorClass="bg-purple-500/10 text-purple-400"
                    subtitle="Published content"
                    onClick={() => navigate('/reels')}
                />
                <StatCard
                    title="Diamonds in Circulation"
                    value={stats.totalDiamondsInCirculation}
                    icon={Diamond}
                    colorClass="bg-crimzo/10 text-crimzo"
                    subtitle="Platform economy"
                    onClick={() => navigate('/users')}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Pending Withdrawals"
                    value={stats.pendingWithdrawals ?? 0}
                    icon={Banknote}
                    colorClass="bg-amber-500/10 text-amber-400"
                    subtitle={(stats.pendingWithdrawals ?? 0) > 0 ? 'Needs your action' : 'No pending payouts'}
                    onClick={() => navigate('/withdrawals')}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2" padding>
                    <CardHeader
                        title="User Signups"
                        description="New registrations over the last 7 days"
                        icon={<TrendingUp size={18} />}
                    />
                    {chartData.length > 0 ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#FF2D55" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="#FF2D55" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2D" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: '#6B7280', fontSize: 11 }}
                                        tickFormatter={d => d.slice(5)}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fill: '#6B7280', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ background: '#12121D', border: '1px solid #1E1E2D', borderRadius: 12 }}
                                        labelStyle={{ color: '#9CA3AF' }}
                                        itemStyle={{ color: '#FF2D55' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#FF2D55"
                                        strokeWidth={2}
                                        fill="url(#signupGrad)"
                                        name="Signups"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
                            No signup data for the last 7 days
                        </div>
                    )}
                </Card>

                <Card padding>
                    <CardHeader title="Quick Actions" description="Jump to management sections" />
                    <div className="space-y-2">
                        {quickLinks.map(link => {
                            const pending = stats.pendingWithdrawals ?? 0;
                            const showBadge = 'highlightKey' in link && link.highlightKey === 'withdrawals' && pending > 0;
                            return (
                                <button
                                    key={link.to}
                                    onClick={() => navigate(link.to)}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all group text-left ${
                                        showBadge
                                            ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10'
                                            : 'border-dark-border hover:border-crimzo/30 hover:bg-white/[0.02]'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-sm font-semibold ${link.color}`}>{link.label}</p>
                                            {showBadge && (
                                                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
                                                    {pending > 99 ? '99+' : pending}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 mt-0.5">{link.desc}</p>
                                    </div>
                                    <ArrowRight size={16} className={`shrink-0 transition-colors ${showBadge ? 'text-amber-400 group-hover:text-amber-300' : 'text-gray-600 group-hover:text-crimzo'}`} />
                                </button>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
                <Card padding className="border-l-4 border-l-red-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Live Now</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatNumber(stats.activeStreams)}</p>
                    <p className="text-xs text-gray-600 mt-1">Talk rate: ₹{stats.liveTalkRatePerMin ?? 1}/min</p>
                </Card>
                <Card padding className="border-l-4 border-l-blue-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><Video size={12} /> Video Call Revenue</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">₹{formatNumber(stats.videoCallRevenue || 0)}</p>
                    <p className="text-xs text-gray-600 mt-1">₹{stats.videoCallRatePerMin ?? 1}/min · {stats.videoCallSessions || 0} sessions</p>
                </Card>
                <Card padding className="border-l-4 border-l-amber-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><MessageCircle size={12} /> Live Talk Revenue</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">₹{formatNumber(stats.liveTalkRevenue || 0)}</p>
                    <p className="text-xs text-gray-600 mt-1">{stats.pendingTalkRequests || 0} pending requests</p>
                </Card>
                <Card padding className="border-l-4 border-l-emerald-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><IndianRupee size={12} /> Wallet Pool</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">₹{formatNumber(stats.totalWalletBalance || 0)}</p>
                    <p className="text-xs text-gray-600 mt-1">Total user wallet balance</p>
                </Card>
                <Card padding className="border-l-4 border-l-purple-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Content Library</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatNumber(stats.totalReels)}</p>
                    <p className="text-xs text-gray-600 mt-1">Total reels published</p>
                </Card>
                <Card padding className="border-l-4 border-l-crimzo">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Diamond Economy</p>
                    <p className="text-2xl font-bold text-crimzo mt-1">{formatNumber(stats.totalDiamondsInCirculation)} 💎</p>
                    <p className="text-xs text-gray-600 mt-1">Gifts & stickers</p>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;