export interface DashboardStats {
    totalUsers: number;
    activeStreams: number;
    totalReels: number;
    totalDiamondsInCirculation: number;
    totalWalletBalance?: number;
    videoCallRevenue?: number;
    videoCallSessions?: number;
    videoCallPeerBeans?: number;
    videoCallPlatformBeans?: number;
    liveTalkRevenue?: number;
    liveTalkSessions?: number;
    liveTalkHostBeans?: number;
    liveTalkPlatformBeans?: number;
    platformBeansEarned?: number;
    totalUserBeansEarned?: number;
    totalOwnerBeans?: number;
    receiverShare?: number;
    platformShare?: number;
    pendingTalkRequests?: number;
    pendingWithdrawals?: number;
    videoCallRatePerMin?: number;
    liveTalkRatePerMin?: number;
}

export interface PayoutSnapshot {
    type?: string;
    account_holder_name?: string;
    account_number?: string;
    account_last4?: string;
    ifsc?: string;
    bank_name?: string;
    upi_id?: string;
    linked_phone?: string;
}

export interface WithdrawalRow {
    id: string;
    userId?: string;
    username?: string;
    crimzoId?: string;
    email?: string;
    amountInr: number;
    beansUsed: number;
    status: string;
    payoutMode?: string;
    payoutMethod?: string;
    payoutDisplay?: string;
    payoutSnapshot?: PayoutSnapshot;
    utr?: string | null;
    adminNote?: string | null;
    failureReason?: string | null;
    balanceRefunded?: boolean;
    scheduledCreditDate?: string | null;
    createdAt: string;
    completedAt?: string | null;
    processedBy?: string | null;
}

export interface BillingSettings {
    video_call_rate_per_min_inr: number;
    live_talk_rate_per_min_inr: number;
    video_call_billing_enabled: boolean;
    live_talk_billing_enabled: boolean;
    updated_at?: string;
}

export interface BillingStats {
    videoCallRevenue: number;
    videoCallMinutes: number;
    videoCallSessions: number;
    videoCallPeerBeans?: number;
    videoCallPlatformBeans?: number;
    liveTalkRevenue: number;
    liveTalkMinutes: number;
    liveTalkSessions: number;
    liveTalkHostBeans?: number;
    liveTalkPlatformBeans?: number;
    totalUserBeansEarned?: number;
    totalOwnerBeans?: number;
    pendingTalkRequests: number;
}

export interface BillingSessionRow {
    id: string;
    type: string;
    payer?: string;
    payerCrimzoId?: string;
    peer?: string;
    peerCrimzoId?: string;
    talker?: string;
    host?: string;
    hostCrimzoId?: string;
    minutesCharged: number;
    totalCharged: number;
    receiverBeans?: number;
    platformBeans?: number;
    ratePerMin: number;
    status: string;
}

export interface UserEarningsRow {
    userId: string;
    username: string | null;
    crimzoId: string | null;
    videoCallBeans: number;
    liveTalkBeans: number;
    totalBeans: number;
    videoCallSessions: number;
    liveTalkSessions: number;
    totalSessions: number;
    videoCallRevenue: number;
    liveTalkRevenue: number;
    totalRevenue: number;
}

export interface OwnerEarnings {
    totalPlatformBeans: number;
    videoCallPlatformBeans: number;
    liveTalkPlatformBeans: number;
    receiverShare: number;
    platformShare: number;
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

export interface UserTransactionRow {
    id: string;
    category: 'deposit' | 'withdraw';
    type: string;
    direction: 'credit' | 'debit';
    amountInr: number;
    title: string;
    subtitle: string;
    status: string;
    diamonds?: number;
    beans?: number;
    payoutDisplay?: string | null;
    scheduledCreditDate?: string | null;
    utr?: string | null;
    failureReason?: string | null;
    createdAt: string;
    completedAt?: string | null;
}

export interface UserTransactionSummary {
    totalDeposited: number;
    totalPurchased: number;
    totalWithdrawn: number;
    pendingWithdrawn: number;
    depositCount: number;
    purchaseCount: number;
    withdrawCount: number;
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
    talk_rate_per_min?: number;
    talk_billing_enabled?: boolean;
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