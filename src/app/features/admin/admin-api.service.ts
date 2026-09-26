import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import { ReviewApiService } from '../reviews/review-api.service';
import { Review, ReviewStatus } from '../reviews/review.models';
import {
  ListingReport,
  AdminUpdateUserRequest,
  AdminUserDetails,
  AdminUserListItem
} from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly reviewApi = inject(ReviewApiService);

  getUsers(searchTerm = ''): Observable<AdminUserListItem[]> {
    let params = new HttpParams();
    if (searchTerm.trim()) {
      params = params.set('searchTerm', searchTerm.trim());
    }

    return this.http.get<AdminUserListItem[]>(`${apiConfig.baseUrl}/users/admin`, { params });
  }

  getDisputedReviews(): Observable<Review[]> {
    return this.reviewApi.getDisputedReviews();
  }

  getUser(id: string): Observable<AdminUserDetails> {
    return this.http.get<AdminUserDetails>(`${apiConfig.baseUrl}/users/admin/${id}`);
  }

  updateUser(id: string, request: AdminUpdateUserRequest): Observable<AdminUserDetails> {
    return this.http.put<AdminUserDetails>(`${apiConfig.baseUrl}/users/admin/${id}`, request);
  }

  uploadAvatar(id: string, file: File): Observable<{ profileImageUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ profileImageUrl: string }>(
      `${apiConfig.baseUrl}/users/admin/${id}/avatar`,
      formData
    );
  }

  toggleBlock(id: string, isBlocked: boolean): Observable<AdminUserDetails> {
    return this.http.patch<AdminUserDetails>(`${apiConfig.baseUrl}/users/admin/${id}/block`, {
      isBlocked
    });
  }

  moderateReview(reviewId: string, status: ReviewStatus): Observable<Review> {
    return this.reviewApi.moderateReview(reviewId, { status });
  }

  getListingReports(): Observable<ListingReport[]> {
    return this.http.get<ListingReport[]>(`${apiConfig.baseUrl}/admin/listing-reports`);
  }

  moderateListingReport(id: string, blockListing: boolean): Observable<ListingReport> {
    return this.http.patch<ListingReport>(`${apiConfig.baseUrl}/admin/listing-reports/${id}`, {
      blockListing
    });
  }
}
