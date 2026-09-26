import { inject, Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiConfig } from '../../core/config/api.config';
import { ChatMessage, ChatSummary } from './chat.models';

@Injectable({ providedIn: 'root' })
export class ChatRealtimeService {
  private readonly authService = inject(AuthService);
  private readonly messageReceivedSubject = new Subject<ChatMessage>();
  private readonly summaryUpdatedSubject = new Subject<ChatSummary>();
  private connection: HubConnection | null = null;
  private connectedChatIds = new Set<string>();

  readonly messageReceived$ = this.messageReceivedSubject.asObservable();
  readonly summaryUpdated$ = this.summaryUpdatedSubject.asObservable();

  async connect(): Promise<void> {
    const token = this.authService.getAccessToken();
    if (!token) {
      return;
    }

    if (this.connection?.state === HubConnectionState.Connected) {
      return;
    }

    if (!this.connection) {
      this.connection = new HubConnectionBuilder()
        .withUrl(`${apiConfig.origin}/hubs/chat`, {
          accessTokenFactory: () => this.authService.getAccessToken() ?? ''
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('MessageReceived', (message: ChatMessage) => {
        this.messageReceivedSubject.next(message);
      });

      this.connection.on('ChatSummaryUpdated', (summary: ChatSummary) => {
        this.summaryUpdatedSubject.next(summary);
      });

      this.connection.onreconnected(async () => {
        const chatIds = [...this.connectedChatIds];
        for (const chatId of chatIds) {
          await this.connection?.invoke('JoinChat', chatId);
        }
      });
    }

    if (this.connection.state === HubConnectionState.Disconnected) {
      await this.connection.start();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      return;
    }

    this.connectedChatIds.clear();
    if (this.connection.state !== HubConnectionState.Disconnected) {
      await this.connection.stop();
    }
  }

  async joinChat(chatId: string): Promise<void> {
    await this.connect();
    if (!this.connection || this.connectedChatIds.has(chatId)) {
      return;
    }

    await this.connection.invoke('JoinChat', chatId);
    this.connectedChatIds.add(chatId);
  }

  async leaveChat(chatId: string): Promise<void> {
    if (!this.connection || !this.connectedChatIds.has(chatId)) {
      return;
    }

    if (this.connection.state === HubConnectionState.Connected) {
      await this.connection.invoke('LeaveChat', chatId);
    }

    this.connectedChatIds.delete(chatId);
  }
}
