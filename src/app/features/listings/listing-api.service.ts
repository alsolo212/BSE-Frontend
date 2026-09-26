import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import {
  ListingCategory,
  ListingDetails,
  ListingQuery,
  ListingImageUploadResponse,
  ListingSummary,
  ListingUpsertRequest
} from './listing.models';

@Injectable({ providedIn: 'root' })
export class ListingApiService {
  private readonly http = inject(HttpClient);

  getCategories(): Observable<ListingCategory[]> {
    return this.http.get<ListingCategory[]>(`${apiConfig.baseUrl}/catalog/categories`);
  }

  getMyListings(): Observable<ListingSummary[]> {
    return this.http.get<ListingSummary[]>(`${apiConfig.baseUrl}/listings/mine`);
  }

  getListings(query: ListingQuery = {}): Observable<ListingSummary[]> {
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

    if (query.status) {
      params = params.set('status', query.status);
    }

    if (query.ownerId?.trim()) {
      params = params.set('ownerId', query.ownerId.trim());
    }

    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy);
    }

    if (query.includeHidden) {
      params = params.set('includeHidden', 'true');
    }

    return this.http.get<ListingSummary[]>(`${apiConfig.baseUrl}/listings`, { params });
  }

  getListing(id: string): Observable<ListingDetails> {
    return this.http.get<ListingDetails>(`${apiConfig.baseUrl}/listings/${id}`);
  }

  createListing(request: ListingUpsertRequest): Observable<ListingDetails> {
    return this.http.post<ListingDetails>(`${apiConfig.baseUrl}/listings`, request);
  }

  updateListing(id: string, request: ListingUpsertRequest): Observable<ListingDetails> {
    return this.http.put<ListingDetails>(`${apiConfig.baseUrl}/listings/${id}`, request);
  }

  updateListingStatus(id: string, status: ListingSummary['status']): Observable<ListingDetails> {
    return this.http.patch<ListingDetails>(`${apiConfig.baseUrl}/listings/${id}/status`, { status });
  }

  deleteListing(id: string): Observable<void> {
    return this.http.delete<void>(`${apiConfig.baseUrl}/listings/${id}`);
  }

  uploadImages(files: File[]): Observable<ListingImageUploadResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    return this.http.post<ListingImageUploadResponse>(`${apiConfig.baseUrl}/listings/images`, formData);
  }

  reportListing(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${apiConfig.baseUrl}/listings/${id}/report`, { reason });
  }
}
