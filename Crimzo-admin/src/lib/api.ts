import axios from 'axios';

export const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

export const api = axios.create({
    baseURL: `${API_URL}/api/admin`,
});

export function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}