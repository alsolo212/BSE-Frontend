export interface UserProfile {
  id: string;
  userName: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  createdAtUtc: string;
  isVerified: boolean;
  isBlocked: boolean;
  activeListingsCount: number;
  averageRating: number;
  reviewsCount: number;
}

export interface UpdateProfileRequest {
  userName: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  currentPassword: string;
}

export interface AvatarUploadResponse {
  profileImageUrl: string;
}

export interface ProfileListing {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  city: string;
  condition: string;
  status: string;
  categoryId: string;
  categoryName: string;
  primaryImageUrl?: string | null;
  createdAtUtc: string;
}
