import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import {
  CreateReviewRequest,
  DisputeReviewRequest,
  Review,
  UpdateReviewModerationRequest
} from './review.models';

@Injectable({ providedIn: 'root' })
export class ReviewApiService {
  private readonly http = inject(HttpClient);

  getUserReviews(userId: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${apiConfig.baseUrl}/reviews/users/${userId}`);
  }

  getListingReviews(listingId: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${apiConfig.baseUrl}/reviews/listings/${listingId}`);
  }

  createReview(request: CreateReviewRequest): Observable<Review> {
    return this.http.post<Review>(`${apiConfig.baseUrl}/reviews`, request);
  }

  disputeReview(reviewId: string, request: DisputeReviewRequest): Observable<Review> {
    return this.http.post<Review>(`${apiConfig.baseUrl}/reviews/${reviewId}/dispute`, request);
  }

  getDisputedReviews(): Observable<Review[]> {
    return this.http.get<Review[]>(`${apiConfig.baseUrl}/reviews/admin/disputes`);
  }

  moderateReview(reviewId: string, request: UpdateReviewModerationRequest): Observable<Review> {
    return this.http.patch<Review>(`${apiConfig.baseUrl}/reviews/admin/${reviewId}`, request);
  }
}
