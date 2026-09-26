import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiConfig } from '../../core/config/api.config';
import {
  ChatAttachmentUploadResponse,
  ChatMessage,
  ChatSummary,
  SendMessageRequest,
  StartChatRequest,
  StartSupportChatResponse
} from './chat.models';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);

  getMyChats(userId?: string, supportOnly = false): Observable<ChatSummary[]> {
    const params = new URLSearchParams();
    if (userId?.trim()) {
      params.set('userId', userId.trim());
    }
    if (supportOnly) {
      params.set('supportOnly', 'true');
    }

    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.http.get<ChatSummary[]>(`${apiConfig.baseUrl}/chats${suffix}`);
  }

  startChat(request: StartChatRequest): Observable<ChatSummary> {
    return this.http.post<ChatSummary>(`${apiConfig.baseUrl}/chats`, request);
  }

  startSupportChat(): Observable<StartSupportChatResponse> {
    return this.http.post<StartSupportChatResponse>(`${apiConfig.baseUrl}/chats/support`, {});
  }

  claimSupportChat(chatId: string): Observable<ChatSummary> {
    return this.http.post<ChatSummary>(`${apiConfig.baseUrl}/chats/${chatId}/claim`, {});
  }

  getMessages(chatId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${apiConfig.baseUrl}/chats/${chatId}/messages`);
  }

  sendMessage(chatId: string, request: SendMessageRequest): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${apiConfig.baseUrl}/chats/${chatId}/messages`, request);
  }

  uploadAttachment(chatId: string, file: File): Observable<ChatAttachmentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ChatAttachmentUploadResponse>(
      `${apiConfig.baseUrl}/chats/${chatId}/attachments`,
      formData
    );
  }
}
