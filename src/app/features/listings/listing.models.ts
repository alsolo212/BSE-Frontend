export type ListingCondition = 'New' | 'Used';

export type ListingStatus =
  | 'Draft'
  | 'Active'
  | 'Published'
  | 'ReadyToShip'
  | 'InDelivery'
  | 'Sold'
  | 'Arrived'
  | 'Archived'
  | 'Inactive'
  | 'Blocked';

export interface ListingCategory {
  id: string;
  name: string;
  imageUrl?: string | null;
}

export interface ListingOwner {
  id: string;
  userName: string;
  profileImageUrl?: string | null;
  isVerified: boolean;
}

export interface ListingImage {
  id: string;
  url: string;
  sortOrder: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  price: number;
  quantity: number;
  isNegotiable: boolean;
  city: string;
  condition: ListingCondition;
  status: ListingStatus;
  hasActiveOrders: boolean;
  categoryId: string;
  categoryName: string;
  primaryImageUrl?: string | null;
  createdAtUtc: string;
  owner: ListingOwner;
}

export interface ListingDetails {
  id: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  isNegotiable: boolean;
  city: string;
  condition: ListingCondition;
  status: ListingStatus;
  hasActiveOrders: boolean;
  categoryId: string;
  categoryName: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  owner: ListingOwner;
  images: ListingImage[];
}

export interface ListingUpsertRequest {
  title: string;
  description: string;
  price: number;
  quantity: number;
  isNegotiable: boolean;
  city: string;
  categoryId: string;
  condition: ListingCondition;
  imageUrls: string[];
}

export interface ListingQuery {
  searchTerm?: string;
  categoryId?: string;
  city?: string;
  condition?: ListingCondition;
  status?: ListingStatus;
  ownerId?: string;
  sortBy?: 'newest' | 'cheapest' | 'expensive';
  includeHidden?: boolean;
}

export interface ListingImageUploadItem {
  url: string;
  fileName: string;
}

export interface ListingImageUploadResponse {
  images: ListingImageUploadItem[];
}
