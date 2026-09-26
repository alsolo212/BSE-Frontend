export type ReviewStatus = 'Published' | 'Disputed' | 'Removed' | 'Hidden';

export interface Review {
  id: string;
  orderId: string;
  listingId: string;
  authorId: string;
  authorName: string;
  targetUserId: string;
  targetUserName: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  disputeReason?: string | null;
  listingTitle?: string | null;
  orderStatus?: string | null;
  createdAtUtc: string;
}

export interface CreateReviewRequest {
  orderId: string;
  targetUserId?: string | null;
  rating: number;
  comment: string;
}

export interface DisputeReviewRequest {
  reason: string;
}

export interface UpdateReviewModerationRequest {
  status: ReviewStatus;
}
