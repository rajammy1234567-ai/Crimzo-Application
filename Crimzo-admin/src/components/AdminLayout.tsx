import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, authHeaders } from '../lib/api';
import {
    LayoutDashboard, Users, Radio, Film, Image as ImageIcon, LogOut,
    Menu, X, Shield, IndianRupee, Banknote, ListChecks,
} from 'lucide-react';

const navSections = [
    {
        title: 'Overview',
        items: [
            { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Stats & analytics' },
            { to: '/withdrawals', icon: Banknote, label: 'Withdrawals', desc: 'User payout requests', badgeKey: 'withdrawals' as const },
        ]
    },
    {
        title: 'User Management',
        items: [
            { to: '/users', icon: Users, label: 'Users', desc: 'Ban, diamonds, search' },
        ]
    },
    {
        title: 'Monetization',
        items: [
            { to: '/billing', icon: IndianRupee, label: 'Billing & Rates', desc: 'Video call + live talk ₹/min' },
            { to: '/tasks', icon: ListChecks, label: 'My Tasks', desc: 'User tasks + rewards' },
        ]
    },
    {
        title: 'Content & Moderation',
        items: [
            { to: '/streams', icon: Radio, label: 'Live Streams', desc: 'Active & ended' },
            { to: '/reels', icon: Film, label: 'Reels', desc: 'Content moderation' },
            { to: '/stickers', icon: ImageIcon, label: 'Stickers & Gifts', desc: 'Diamond gifts' },
        ]
    }
];

const pageMeta: Record<string, { title: string; section: string }> = {
    '/dashboard': { title: 'Dashboard', section: 'Overview' },
    '/users': { title: 'Users', section: 'User Management' },
    '/streams': { title: 'Live Streams', section: 'Content & Moderation' },
    '/reels': { title: 'Reels', section: 'Content & Moderation' },
    '/stickers': { title: 'Stickers & Gifts', section: 'Content & Moderation' },
    '/billing': { title: 'Billing & Rates', section: 'Monetization' },
    '/withdrawals': { title: 'Withdrawals', section: 'Overview' },
    '/tasks': { title: 'My Tasks', section: 'Monetization' },
};

const AdminLayout = () => {
    const { logout, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

    useEffect(() => {
        if (!token) return;

        const loadPending = async () => {
            try {
                const res = await api.get('/withdrawals', {
                    headers: authHeaders(token),
                    params: { status: 'pending', page: 1, limit: 1 },
                });
                setPendingWithdrawals(res.data?.counts?.pending ?? 0);
            } catch {
                try {
                    const dash = await api.get('/dashboard', { headers: authHeaders(token) });
                    setPendingWithdrawals(dash.data?.stats?.pendingWithdrawals ?? 0);
                } catch {
                    setPendingWithdrawals(0);
                }
            }
        };

        void loadPending();
        const interval = setInterval(loadPending, 60000);
        return () => clearInterval(interval);
    }, [token, location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const meta = pageMeta[location.pathname] || { title: 'Admin Panel', section: 'Crimzo' };

    const SidebarContent = () => (
        <>
            <div className="h-16 flex items-center px-5 border-b border-dark-border shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-crimzo to-crimzo-dark flex items-center justify-center shadow-lg shadow-crimzo/20">
                        <Shield size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold tracking-wide text-white">CRIMZO</h1>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Admin Console</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
                {navSections.map((section, idx) => (
                    <div key={idx} className="mb-5">
                        <p className="section-label">{section.title}</p>
                        <div className="space-y-0.5 px-3">
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    onClick={() => setSidebarOpen(false)}
                                    className={({ isActive }) =>
                                        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${isActive
                                            ? 'bg-crimzo/10 text-crimzo'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            {isActive && <span className="nav-active-indicator" />}
                                            <item.icon size={18} className="shrink-0 ml-1" />
                                            <div className="min-w-0 flex-1">
                                                <span className={`text-sm block ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                                    {item.label}
                                                </span>
                                                <span className="text-[10px] text-gray-600 group-hover:text-gray-500 truncate block">
                                                    {item.desc}
                                                </span>
                                            </div>
                                            {'badgeKey' in item && item.badgeKey === 'withdrawals' && pendingWithdrawals > 0 && (
                                                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
                                                    {pendingWithdrawals > 99 ? '99+' : pendingWithdrawals}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="p-4 border-t border-dark-border shrink-0">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
                >
                    <LogOut size={18} />
                    <span className="text-sm font-medium">Sign Out</span>
                </button>
            </div>
        </>
    );

    return (
        <div className="flex bg-dark-bg min-h-screen text-white">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-64 bg-dark-card border-r border-dark-border flex-col fixed inset-y-0 left-0 z-30">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="lg:hidden fixed inset-0 z-40">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                    <aside className="absolute left-0 top-0 bottom-0 w-72 bg-dark-card border-r border-dark-border flex flex-col animate-fade-in">
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                        <SidebarContent />
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
                <header className="h-14 bg-dark-card/80 backdrop-blur-md border-b border-dark-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-20 shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
                        >
                            <Menu size={20} />
                        </button>
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{meta.section}</p>
                            <h2 className="text-base font-bold text-white leading-tight">{meta.title}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {pendingWithdrawals > 0 && (
                            <button
                                type="button"
                                onClick={() => navigate('/withdrawals')}
                                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full hover:bg-amber-500/25 transition-colors"
                            >
                                <Banknote size={14} className="text-amber-400" />
                                <span className="text-xs font-semibold text-amber-300">
                                    {pendingWithdrawals} withdrawal{pendingWithdrawals === 1 ? '' : 's'} pending
                                </span>
                            </button>
                        )}
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            <span className="text-xs font-medium text-emerald-400">System Online</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-crimzo to-purple-600 flex items-center justify-center text-xs font-bold">
                            A
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;