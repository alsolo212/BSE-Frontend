import { ReviewStatus } from '../reviews/review.models';

export interface AdminUserListItem {
  id: string;
  userName: string;
  email: string;
  profileImageUrl?: string | null;
  phone?: string | null;
  isVerified: boolean;
  isBlocked: boolean;
  activeListingsCount: number;
  roles: string[];
}

export interface AdminUserDetails extends AdminUserListItem {
  profileImageUrl?: string | null;
  createdAtUtc: string;
  averageRating: number;
  reviewsCount: number;
}

export interface AdminUpdateUserRequest {
  userName: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  role?: 'User' | 'Admin' | null;
}

export interface ReviewModerationRequest {
  status: ReviewStatus;
}

export type ListingReportStatus = 'Pending' | 'Dismissed' | 'Blocked';

export interface ListingReport {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrimaryImageUrl?: string | null;
  ownerId: string;
  ownerName: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: ListingReportStatus;
  createdAtUtc: string;
  resolvedAtUtc?: string | null;
}
