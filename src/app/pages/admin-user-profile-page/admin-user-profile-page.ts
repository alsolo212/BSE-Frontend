import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { AdminUserDetails } from '../../features/admin/admin.models';
import { ChatApiService } from '../../features/chats/chat-api.service';
import { ChatMessage, ChatSummary } from '../../features/chats/chat.models';
import {
  formatListingCondition,
  formatListingStatus
} from '../../features/listings/listing.constants';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { ListingSummary } from '../../features/listings/listing.models';
import {
  formatOrderStatus,
  formatPaymentMethod,
  formatShipmentStatus
} from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import { OrderSummary } from '../../features/orders/order.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type AdminProfileTab = 'products' | 'sold' | 'orders' | 'chats' | 'reviews';

@Component({
  selector: 'app-admin-user-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, SiteShellComponent],
  templateUrl: './admin-user-profile-page.html',
  styleUrl: './admin-user-profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUserProfilePageComponent {
  private shouldScrollMessagesToBottom = false;
  private scrollMessagesFrame: number | null = null;
  private scrollMessagesRetryCount = 0;

  @ViewChild('chatMessagesViewport')
  private chatMessagesViewport?: ElementRef<HTMLElement>;

  private readonly adminApi = inject(AdminApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly listingApi = inject(ListingApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isUpdating = signal(false);
  protected readonly isMessagesLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly profile = signal<AdminUserDetails | null>(null);
  protected readonly listings = signal<ListingSummary[]>([]);
  protected readonly buyerOrders = signal<OrderSummary[]>([]);
  protected readonly soldOrders = signal<OrderSummary[]>([]);
  protected readonly chats = signal<ChatSummary[]>([]);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly activeTab = signal<AdminProfileTab>('products');
  protected readonly activeChatId = signal<string | null>(null);

  protected readonly tabs = [
    { key: 'products' as const, label: 'Products' },
    { key: 'sold' as const, label: 'Sold' },
    { key: 'orders' as const, label: 'Orders' },
    { key: 'chats' as const, label: 'Chats' },
    { key: 'reviews' as const, label: 'Reviews' }
  ];

  protected readonly activeChat = computed(() =>
    this.chats().find(chat => chat.id === this.activeChatId()) ?? null
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.shouldScrollMessagesToBottom = false;
      if (this.scrollMessagesFrame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(this.scrollMessagesFrame);
        this.scrollMessagesFrame = null;
      }
    });

    const userId = this.route.snapshot.paramMap.get('id');
    if (!userId) {
      void this.router.navigateByUrl('/error?code=404');
      return;
    }

    this.loadPage(userId);
  }

  protected setActiveTab(tab: AdminProfileTab): void {
    this.activeTab.set(tab);
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected openEditUser(): void {
    const userId = this.profile()?.id;
    if (userId) {
      void this.router.navigate(['/admin/users', userId, 'edit']);
    }
  }

  protected toggleUserBlock(): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    this.isUpdating.set(true);
    this.adminApi
      .toggleBlock(profile.id, !profile.isBlocked)
      .pipe(finalize(() => this.isUpdating.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedUser => {
          this.profile.set(updatedUser);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to change block status.'));
        }
      });
  }

  protected toggleListingBlock(listing: ListingSummary): void {
    const nextStatus = listing.status === 'Blocked' ? 'Published' : 'Blocked';
    this.isUpdating.set(true);
    this.listingApi
      .updateListingStatus(listing.id, nextStatus)
      .pipe(finalize(() => this.isUpdating.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedListing => {
          const nextListings = this.listings().map(item =>
            item.id === updatedListing.id ? { ...item, status: updatedListing.status } : item
          );
          this.listings.set(nextListings);
          this.profile.update(profile =>
            profile
              ? {
                  ...profile,
                  activeListingsCount: itemsVisibleCount(nextListings)
                }
              : profile
          );
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update listing status.'));
        }
      });
    function itemsVisibleCount(items: ListingSummary[]): number {
      return items.filter(item => item.status === 'Published' || item.status === 'Active').length;
    }
  }

  protected openListing(listingId: string): void {
    openRouteInNewTab(this.router, ['/listings', listingId]);
  }

  protected openChat(chatId: string): void {
    this.activeChatId.set(chatId);
    this.isMessagesLoading.set(true);
    this.chatApi
      .getMessages(chatId)
      .pipe(finalize(() => this.isMessagesLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: messages => {
          this.chatMessages.set(messages);
          this.queueMessagesScrollToBottom();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load messages.'));
        }
      });
  }

  protected listingImageUrl(listing: ListingSummary): string | null {
    return resolveApiUrl(listing.primaryImageUrl);
  }

  protected orderImageUrl(order: OrderSummary): string | null {
    return resolveApiUrl(order.listingPrimaryImageUrl);
  }

  protected chatAvatarUrl(chat?: ChatSummary | null): string | null {
    return resolveApiUrl(chat?.counterpartyAvatarUrl);
  }

  protected attachmentUrl(message: ChatMessage): string | null {
    return resolveApiUrl(message.attachmentUrl);
  }

  protected isImageMessage(message: ChatMessage): boolean {
    return message.type === 'Image';
  }

  protected formatCondition(condition: ListingSummary['condition']): string {
    return formatListingCondition(condition);
  }

  protected formatStatus(status: ListingSummary['status']): string {
    return formatListingStatus(status);
  }

  protected formatOrderStatus(status: OrderSummary['status']): string {
    return formatOrderStatus(status);
  }

  protected formatShipmentStatus(status?: OrderSummary['shipmentStatus']): string {
    return formatShipmentStatus(status);
  }

  protected formatPaymentMethod(paymentMethod: OrderSummary['paymentMethod']): string {
    return formatPaymentMethod(paymentMethod);
  }

  protected reviewStatusLabel(review: Review): string {
    switch (review.status) {
      case 'Disputed':
        return 'Disputed';
      case 'Hidden':
        return 'Hidden';
      case 'Removed':
        return 'Removed';
      default:
        return 'Active';
    }
  }

  protected avatarUrl(): string | null {
    return resolveApiUrl(this.profile()?.profileImageUrl);
  }

  protected userInitial(): string {
    return this.profile()?.userName?.charAt(0).toUpperCase() || 'B';
  }

  private queueMessagesScrollToBottom(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.shouldScrollMessagesToBottom = true;
    this.scrollMessagesRetryCount = 0;
    if (this.scrollMessagesFrame !== null) {
      window.cancelAnimationFrame(this.scrollMessagesFrame);
    }

    this.scrollMessagesFrame = window.requestAnimationFrame(() => {
      this.scrollMessagesFrame = null;
      this.scrollMessagesToBottom();
    });
  }

  private scrollMessagesToBottom(): void {
    if (!this.shouldScrollMessagesToBottom || !this.activeChatId()) {
      this.shouldScrollMessagesToBottom = false;
      return;
    }

    const viewport = this.chatMessagesViewport?.nativeElement;
    if (!viewport) {
      if (this.scrollMessagesRetryCount >= 4) {
        this.shouldScrollMessagesToBottom = false;
        this.scrollMessagesRetryCount = 0;
        return;
      }

      this.scrollMessagesRetryCount += 1;
      this.scrollMessagesFrame = window.requestAnimationFrame(() => {
        this.scrollMessagesFrame = null;
        this.scrollMessagesToBottom();
      });
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    this.scrollMessagesFrame = window.requestAnimationFrame(() => {
      this.scrollMessagesFrame = null;
      if (this.shouldScrollMessagesToBottom) {
        viewport.scrollTop = viewport.scrollHeight;
        this.shouldScrollMessagesToBottom = false;
        this.scrollMessagesRetryCount = 0;
      }
    });
  }

  private loadPage(userId: string): void {
    forkJoin({
      profile: this.adminApi.getUser(userId),
      listings: this.listingApi.getListings({ ownerId: userId, includeHidden: true }),
      buyerOrders: this.orderApi.getMyOrders(false, userId),
      soldOrders: this.orderApi.getMyOrders(true, userId),
      chats: this.chatApi.getMyChats(userId),
      reviews: this.reviewApi.getUserReviews(userId)
    })
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ profile, listings, buyerOrders, soldOrders, chats, reviews }) => {
          this.profile.set(profile);
          this.listings.set(listings.filter(listing => listing.status !== 'Inactive'));
          this.buyerOrders.set(buyerOrders);
          this.soldOrders.set(soldOrders);
          this.chats.set(chats);
          this.reviews.set(reviews);
          if (chats.length > 0) {
            this.openChat(chats[0].id);
          }
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load this profile.'));
        }
      });
  }
}
