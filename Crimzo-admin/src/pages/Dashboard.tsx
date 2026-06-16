import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, Radio, Film, Diamond, ArrowRight, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, authHeaders } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardHeader } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingState';
import type { DashboardStats, ChartDataPoint } from '../types';
import { formatNumber } from '../lib/utils';

const quickLinks = [
    { to: '/users', label: 'Manage Users', desc: 'Ban, search, adjust diamonds', color: 'text-blue-400' },
    { to: '/streams', label: 'Live Streams', desc: 'Monitor & terminate active streams', color: 'text-red-400' },
    { to: '/reels', label: 'Reels Moderation', desc: 'Review & remove content', color: 'text-purple-400' },
    { to: '/stickers', label: 'Stickers Store', desc: 'Add & manage gift economy', color: 'text-amber-400' },
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
                        {quickLinks.map(link => (
                            <button
                                key={link.to}
                                onClick={() => navigate(link.to)}
                                className="w-full flex items-center justify-between p-3 rounded-xl border border-dark-border hover:border-crimzo/30 hover:bg-white/[0.02] transition-all group text-left"
                            >
                                <div>
                                    <p className={`text-sm font-semibold ${link.color}`}>{link.label}</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{link.desc}</p>
                                </div>
                                <ArrowRight size={16} className="text-gray-600 group-hover:text-crimzo transition-colors" />
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <Card padding className="border-l-4 border-l-red-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Live Now</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatNumber(stats.activeStreams)}</p>
                    <p className="text-xs text-gray-600 mt-1">Active live streams</p>
                </Card>
                <Card padding className="border-l-4 border-l-purple-500">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Content Library</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatNumber(stats.totalReels)}</p>
                    <p className="text-xs text-gray-600 mt-1">Total reels published</p>
                </Card>
                <Card padding className="border-l-4 border-l-crimzo">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Economy</p>
                    <p className="text-2xl font-bold text-crimzo mt-1">{formatNumber(stats.totalDiamondsInCirculation)} 💎</p>
                    <p className="text-xs text-gray-600 mt-1">Diamonds across all users</p>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;