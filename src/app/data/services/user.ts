import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { apiConfig } from '../../core/config/api.config';

@Injectable({
  providedIn: 'root'
})
export class User {
  private readonly http = inject(HttpClient);

  getUsers() {
    return this.http.get(`${apiConfig.baseUrl}/users`);
  }
}
