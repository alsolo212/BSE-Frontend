import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class User {
  http = inject(HttpClient)
  baseApiUrl = 'http://localhost:7777/'
  getUsers() {
    return this.http.get('${this.baseApiUrl}users')
  }
}