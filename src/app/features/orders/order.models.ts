import { ListingSummary } from '../listings/listing.models';
import { UserProfile } from '../profile/profile.models';

export type PaymentMethod = 'Card' | 'CashOnDelivery';
export type PaymentState = 'NotApplicable' | 'Paid' | 'TransferPending' | 'Transferred' | 'RefundPending' | 'Refunded' | 'Failed';
export type OrderStatus = 'Pending' | 'Accepted' | 'Declined' | 'Cancelled' | 'Shipped' | 'Delivered' | 'ReadyForPickup' | 'Expired';
export type ShipmentStatus = 'Pending' | 'ReadyToShip' | 'InDelivery' | 'Arrived' | 'Cancelled';

export interface OrderChangedEvent {
  orderId: string;
  changeType: 'created' | 'updated';
}

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
  paymentState: PaymentState;
  quantity: number;
  paymentCardMasked?: string | null;
  totalAmount: number;
  deliveryCity: string;
  deliveryAddress: string;
  createdAtUtc: string;
  sellerDecisionDeadlineUtc: string;
  readyForPickupAtUtc?: string | null;
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
  paymentState: PaymentState;
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
  sellerDecisionDeadlineUtc: string;
  readyForPickupAtUtc?: string | null;
  listing: ListingSummary;
  buyer: UserProfile;
  seller: UserProfile;
  shipment?: ShipmentDetails | null;
}

export interface CreateOrderRequest {
  listingId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
}

export interface CreateCheckoutSessionRequest {
  listingId?: string;
  quantity?: number;
  cartItemIds?: string[];
  saveCard: boolean;
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface CreatePaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  publishableKey: string;
}

export interface StripePublicConfigResponse {
  publishableKey: string;
}

export interface CheckoutCartRequest {
  cartItemIds: string[];
  paymentMethod: PaymentMethod;
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
  payoutCardMasked?: string;
}

export interface ConnectOnboardingResponse {
  clientSecret: string;
  accountId: string;
  publishableKey: string;
  isComplete: boolean;
}
