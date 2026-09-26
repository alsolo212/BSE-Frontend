import { ListingSummary } from '../listings/listing.models';
import { UserProfile } from '../profile/profile.models';

export type PaymentMethod = 'Card' | 'CashOnDelivery';
export type OrderStatus = 'Pending' | 'Accepted' | 'Declined' | 'Cancelled' | 'Shipped' | 'Delivered';
export type ShipmentStatus = 'Pending' | 'ReadyToShip' | 'InDelivery' | 'Arrived' | 'Cancelled';

export interface OrderSummary {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrimaryImageUrl?: string | null;
  buyerId: string;
  sellerId: string;
  counterpartyName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  quantity: number;
  paymentCardMasked?: string | null;
  totalAmount: number;
  deliveryCity: string;
  deliveryAddress: string;
  createdAtUtc: string;
  shipmentStatus?: ShipmentStatus | null;
  hasReviewFromCurrentUser: boolean;
}

export interface ShipmentDetails {
  id: string;
  status: ShipmentStatus;
  recipientFirstName: string;
  recipientLastName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  payoutCardMasked: string;
  shippedAtUtc?: string | null;
  arrivedAtUtc?: string | null;
}

export interface OrderDetails {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  quantity: number;
  paymentCardMasked?: string | null;
  totalAmount: number;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  listing: ListingSummary;
  buyer: UserProfile;
  seller: UserProfile;
  shipment?: ShipmentDetails | null;
}

export interface CreateOrderRequest {
  listingId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  cardCvc?: string | null;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
}

export interface CheckoutCartRequest {
  cartItemIds: string[];
  paymentMethod: PaymentMethod;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  cardCvc?: string | null;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
}

export interface CheckoutCartResponse {
  orders: OrderDetails[];
  totalAmount: number;
}

export interface UpdateShipmentRequest {
  status: ShipmentStatus;
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  payoutCardMasked: string;
}
