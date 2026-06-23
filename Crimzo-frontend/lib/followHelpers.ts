export type FollowActionResponse = {
  action?: string;
  isFollowing?: boolean;
  isRequested?: boolean;
  followers_count?: number;
  following_count?: number;
  friends_count?: number;
};

export type FollowUiState = {
  isFollowing: boolean;
  isRequested: boolean;
};

/** Normalize follow API responses across all screens. */
export function parseFollowResponse(res: FollowActionResponse): FollowUiState {
  const action = res.action;

  if (action === 'unfollowed' || action === 'request_cancelled' || action === 'rejected') {
    return { isFollowing: false, isRequested: false };
  }

  const isFollowing = res.isFollowing
    ?? (action === 'followed' || action === 'accepted');
  const isRequested = res.isRequested ?? action === 'requested';

  return {
    isFollowing: !!isFollowing,
    isRequested: !isFollowing && !!isRequested,
  };
}

export function followButtonLabel(
  isFollowing: boolean,
  isRequested: boolean,
  options?: { followersList?: boolean },
): string {
  if (isFollowing) return 'Following';
  if (isRequested) return 'Requested';
  if (options?.followersList) return 'Follow back';
  return 'Follow';
}