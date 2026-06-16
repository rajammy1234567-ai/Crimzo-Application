export interface DashboardStats {
    totalUsers: number;
    activeStreams: number;
    totalReels: number;
    totalDiamondsInCirculation: number;
}

export interface ChartDataPoint {
    date: string;
    count: number;
}

export interface User {
    id: string;
    _id?: string;
    crimzo_id: string;
    username: string;
    email: string;
    country?: string;
    diamonds: number;
    beans?: number;
    status?: string;
    is_banned: boolean;
    created_at: string;
}

export interface Stream {
    id: string;
    _id?: string;
    username: string;
    crimzo_id: string;
    avatar?: string;
    channel_name: string;
    status: 'active' | 'ended';
    viewers_count: number;
    started_at: string;
    ended_at?: string;
}

export interface Reel {
    id: string;
    _id?: string;
    username: string;
    crimzo_id: string;
    user_id?: { avatar?: string };
    video_url: string;
    thumbnail_url?: string;
    caption?: string;
    likes_count: number;
    comments_count: number;
    views_count: number;
    created_at: string;
}

export interface Sticker {
    id: string;
    _id?: string;
    name: string;
    emoji: string;
    price: number;
    category: string;
    is_animated?: boolean;
}

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'live' | 'purple';