import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import { CatalogCategory, CatalogHomeResponse, CatalogProduct, CatalogProductsQuery } from './catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = apiConfig.baseUrl;

  getHome(): Observable<CatalogHomeResponse> {
    return this.http.get<CatalogHomeResponse>(`${this.baseUrl}/catalog/home`);
  }

  getCategories(): Observable<CatalogCategory[]> {
    return this.http.get<CatalogCategory[]>(`${this.baseUrl}/catalog/categories`);
  }

  getProducts(query: CatalogProductsQuery = {}): Observable<CatalogProduct[]> {
    let params = new HttpParams();

    if (query.searchTerm?.trim()) {
      params = params.set('searchTerm', query.searchTerm.trim());
    }

    if (query.categoryId?.trim()) {
      params = params.set('categoryId', query.categoryId.trim());
    }

    if (query.city?.trim()) {
      params = params.set('city', query.city.trim());
    }

    if (query.condition) {
      params = params.set('condition', query.condition);
    }

    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy);
    }

    return this.http.get<CatalogProduct[]>(`${this.baseUrl}/catalog/products`, { params });
  }
}
