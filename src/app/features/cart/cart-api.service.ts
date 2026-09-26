import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import { AddCartItemRequest, CartResponse, UpdateCartItemRequest } from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartApiService {
  private readonly http = inject(HttpClient);

  getCart(): Observable<CartResponse> {
    return this.http.get<CartResponse>(`${apiConfig.baseUrl}/cart`);
  }

  addToCart(request: AddCartItemRequest): Observable<CartResponse> {
    return this.http.post<CartResponse>(`${apiConfig.baseUrl}/cart`, request);
  }

  updateItem(itemId: string, request: UpdateCartItemRequest): Observable<CartResponse> {
    return this.http.patch<CartResponse>(`${apiConfig.baseUrl}/cart/${itemId}`, request);
  }

  removeItem(itemId: string): Observable<CartResponse> {
    return this.http.delete<CartResponse>(`${apiConfig.baseUrl}/cart/${itemId}`);
  }
}
