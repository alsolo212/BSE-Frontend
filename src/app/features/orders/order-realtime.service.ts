import { inject, Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiConfig } from '../../core/config/api.config';
import { OrderChangedEvent } from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderRealtimeService {
  private readonly authService = inject(AuthService);
  private readonly orderChangedSubject = new Subject<OrderChangedEvent>();
  private connection: HubConnection | null = null;

  readonly orderChanged$ = this.orderChangedSubject.asObservable();

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
        .withUrl(`${apiConfig.origin}/hubs/orders`, {
          accessTokenFactory: () => this.authService.getAccessToken() ?? ''
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('OrderChanged', (event: OrderChangedEvent) => {
        this.orderChangedSubject.next(event);
      });
    }

    if (this.connection.state === HubConnectionState.Disconnected) {
      await this.connection.start();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection || this.connection.state === HubConnectionState.Disconnected) {
      return;
    }

    await this.connection.stop();
  }
}
