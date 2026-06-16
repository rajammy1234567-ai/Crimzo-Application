import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

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
        // Optional: verify token validity on mount
        setLoading(false);
    }, []);

    const login = async (password: string) => {
        try {
            const res = await axios.post(`${API_URL}/api/admin/login`, { password });
            const newToken = res.data.token;
            setToken(newToken);
            localStorage.setItem('admin_token', newToken);
        } catch (err: any) {
            throw new Error(err.response?.data?.error || 'Login failed');
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
