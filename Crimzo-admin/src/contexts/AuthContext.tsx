import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, authHeaders, API_URL } from '../lib/api';

interface AuthContextType {
    token: string | null;
    login: (password: string) => Promise<void>;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verify = async () => {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                await api.get('/dashboard', { headers: authHeaders(token) });
            } catch {
                setToken(null);
                localStorage.removeItem('admin_token');
            } finally {
                setLoading(false);
            }
        };
        verify();
    }, [token]);

    const login = async (password: string) => {
        try {
            const res = await fetch(`${API_URL}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Login failed');
            }
            const data = await res.json();
            const newToken = data.token;
            setToken(newToken);
            localStorage.setItem('admin_token', newToken);
        } catch (err: unknown) {
            throw new Error(err instanceof Error ? err.message : 'Login failed');
        }
    };

    const logout = () => {
        setToken(null);
        localStorage.removeItem('admin_token');
    };

    return (
        <AuthContext.Provider value={{ token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
