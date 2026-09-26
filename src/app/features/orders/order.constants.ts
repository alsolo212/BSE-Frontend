import { OrderStatus, PaymentMethod, ShipmentStatus } from './order.models';

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CashOnDelivery', label: 'Payment upon delivery' },
  { value: 'Card', label: 'Visa/MasterCard' }
];

export function formatPaymentMethod(paymentMethod: PaymentMethod): string {
  return paymentMethod === 'CashOnDelivery' ? 'Payment upon delivery' : 'Visa/MasterCard';
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
      return 'Arrived';
    case 'Cancelled':
      return 'Cancelled';
    case 'Pending':
      return 'Pending';
    default:
      return 'Pending';
  }
}

export function canBuyerCancel(status: OrderStatus): boolean {
  return status !== 'Cancelled' && status !== 'Declined' && status !== 'Delivered';
}

export function canSellerAccept(status: OrderStatus): boolean {
  return status === 'Pending';
}

export function canSellerTrack(status: OrderStatus): boolean {
  return status === 'Accepted' || status === 'Shipped' || status === 'Delivered';
}
