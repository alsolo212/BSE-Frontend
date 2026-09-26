export interface CartItemListing {
  id: string;
  title: string;
  price: number;
  availableQuantity: number;
  isNegotiable: boolean;
  city: string;
  categoryName: string;
  primaryImageUrl?: string | null;
  sellerName: string;
}

export interface CartItem {
  id: string;
  isSelected: boolean;
  quantity: number;
  createdAtUtc: string;
  listing: CartItemListing;
}

export interface CartResponse {
  items: CartItem[];
  selectedTotalAmount: number;
}

export interface AddCartItemRequest {
  listingId: string;
  quantity?: number;
}

export interface UpdateCartItemRequest {
  isSelected: boolean;
  quantity?: number;
}
