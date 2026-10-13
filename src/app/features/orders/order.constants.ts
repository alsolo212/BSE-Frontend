import { OrderStatus, PaymentMethod, PaymentState, ShipmentStatus } from './order.models';

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CashOnDelivery', label: 'Payment upon delivery' },
  { value: 'Card', label: 'Visa/MasterCard' }
];

export function formatPaymentMethod(paymentMethod: PaymentMethod): string {
  return paymentMethod === 'CashOnDelivery' ? 'Payment upon delivery' : 'Visa/MasterCard';
}

export type PaymentStateTone = 'pending' | 'transferred' | 'refunded' | 'failed' | 'cash';

export function formatPaymentState(
  paymentState?: PaymentState | null,
  paymentMethod?: PaymentMethod
): string {
  if (paymentMethod === 'CashOnDelivery' || paymentState === 'NotApplicable') {
    return 'Cash on delivery';
  }

  switch (paymentState) {
    case 'Transferred':
      return 'Payout transferred';
    case 'RefundPending':
      return 'Refund pending';
    case 'Refunded':
      return 'Refunded';
    case 'Failed':
      return 'Payment failed';
    case 'Paid':
    case 'TransferPending':
    default:
      return 'Payout pending';
  }
}

export function paymentStateTone(
  paymentState?: PaymentState | null,
  paymentMethod?: PaymentMethod
): PaymentStateTone {
  if (paymentMethod === 'CashOnDelivery' || paymentState === 'NotApplicable') {
    return 'cash';
  }

  switch (paymentState) {
    case 'Transferred':
      return 'transferred';
    case 'RefundPending':
    case 'Refunded':
      return 'refunded';
    case 'Failed':
      return 'failed';
    case 'Paid':
    case 'TransferPending':
    default:
      return 'pending';
  }
}

export function formatOrderStatus(status: OrderStatus): string {
  switch (status) {
    case 'Accepted':
      return 'Accepted';
    case 'Declined':
      return 'Declined';
    case 'Cancelled':
      return 'Cancelled';
    case 'Shipped':
      return 'Shipped';
    case 'Delivered':
      return 'Delivered';
    case 'ReadyForPickup':
      return 'Ready for pickup';
    case 'Expired':
      return 'Expired';
    default:
      return 'Pending';
  }
}

export function formatShipmentStatus(status?: ShipmentStatus | null): string {
  switch (status) {
    case 'ReadyToShip':
      return 'Ready to ship';
    case 'InDelivery':
      return 'In delivery';
    case 'Arrived':
      return 'Ready for pickup';
    case 'Cancelled':
      return 'Cancelled';
    case 'Pending':
      return 'Pending';
    default:
      return 'Pending';
  }
}

export function canBuyerCancel(status: OrderStatus): boolean {
  return status !== 'Cancelled' && status !== 'Declined' && status !== 'Delivered' && status !== 'Expired';
}

export function canSellerAccept(status: OrderStatus): boolean {
  return status === 'Pending';
}

export function canSellerTrack(status: OrderStatus): boolean {
  return status === 'Accepted' || status === 'Shipped' || status === 'ReadyForPickup' || status === 'Delivered';
}
