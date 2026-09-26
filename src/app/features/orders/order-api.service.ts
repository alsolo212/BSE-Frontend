import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import {
  CheckoutCartRequest,
  CheckoutCartResponse,
  CreateOrderRequest,
  OrderDetails,
  OrderSummary,
  UpdateShipmentRequest
} from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);

  getMyOrders(asSeller = false, userId?: string): Observable<OrderSummary[]> {
    const params: Record<string, string> = { asSeller: `${asSeller}` };
    if (userId?.trim()) {
      params['userId'] = userId.trim();
    }

    return this.http.get<OrderSummary[]>(`${apiConfig.baseUrl}/orders/mine`, { params });
  }

  getOrder(id: string): Observable<OrderDetails> {
    return this.http.get<OrderDetails>(`${apiConfig.baseUrl}/orders/${id}`);
  }

  createOrder(request: CreateOrderRequest): Observable<OrderDetails> {
    return this.http.post<OrderDetails>(`${apiConfig.baseUrl}/orders`, request);
  }

  checkoutCart(request: CheckoutCartRequest): Observable<CheckoutCartResponse> {
    return this.http.post<CheckoutCartResponse>(`${apiConfig.baseUrl}/orders/checkout`, request);
  }

  cancelOrder(id: string, reason = ''): Observable<OrderDetails> {
    return this.http.patch<OrderDetails>(`${apiConfig.baseUrl}/orders/${id}/cancel`, { reason });
  }

  setSellerDecision(id: string, approve: boolean): Observable<OrderDetails> {
    return this.http.patch<OrderDetails>(`${apiConfig.baseUrl}/orders/${id}/decision`, { approve });
  }

  updateShipment(id: string, request: UpdateShipmentRequest): Observable<OrderDetails> {
    return this.http.patch<OrderDetails>(`${apiConfig.baseUrl}/orders/${id}/shipment`, request);
  }
}
