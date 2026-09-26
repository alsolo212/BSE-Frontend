import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import {
  AvatarUploadResponse,
  ProfileListing,
  UpdateProfileRequest,
  UserProfile
} from './profile.models';

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(HttpClient);

  getMyProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${apiConfig.baseUrl}/users/me`);
  }

  getUserProfile(id: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${apiConfig.baseUrl}/users/${id}/profile`);
  }

  updateMyProfile(request: UpdateProfileRequest): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${apiConfig.baseUrl}/users/me`, request);
  }

  uploadAvatar(file: File): Observable<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<AvatarUploadResponse>(`${apiConfig.baseUrl}/users/me/avatar`, formData);
  }

  getMyListings(): Observable<ProfileListing[]> {
    return this.http.get<ProfileListing[]>(`${apiConfig.baseUrl}/listings/mine`);
  }
}
