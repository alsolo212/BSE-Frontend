import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, switchMap, timer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { ChatApiService } from '../../features/chats/chat-api.service';
import { ChatRealtimeService } from '../../features/chats/chat-realtime.service';
import { ChatMessage, ChatSummary } from '../../features/chats/chat.models';
import {
  formatListingCondition,
  formatListingStatus,
  listingConditionFilterOptions,
  listingSortOptions
} from '../../features/listings/listing.constants';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { ListingCondition, ListingSummary } from '../../features/listings/listing.models';
import {
  canBuyerCancel,
  canSellerAccept,
  canSellerTrack,
  formatOrderStatus,
  formatPaymentMethod,
  formatShipmentStatus
} from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import { OrderSummary } from '../../features/orders/order.models';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type ProfileTab = 'products' | 'sold' | 'orders' | 'chats' | 'reviews';
type SeenStorageTab = 'orders' | 'sold' | 'reviews';
type ListingSort = (typeof listingSortOptions)[number]['value'];
type ListingConditionFilter = 'all' | ListingCondition;
type ListingCategoryFilter = 'all' | string;
type ChatRoleFilter = 'all' | 'buying' | 'selling';
type SoldOrderState = 'ordered' | 'awaiting-shipment' | 'in-delivery' | 'refusal' | 'sold';
type SoldSort = 'newest' | 'oldest' | 'price-low' | 'price-high';
type SoldStateFilter = 'all' | SoldOrderState;
type BuyerOrderState = 'pending' | 'in-delivery' | 'refusal' | 'arrived' | 'bought';
type BuyerOrderStateFilter = 'all' | BuyerOrderState;
type BuyerOrderSort = SoldSort;

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, SiteShellComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfilePageComponent {
  private readonly tabSeenStoragePrefix = 'bse.profile.tab-seen';
  private isPreparingRequestedChat = false;
  private joinedChatId: string | null = null;
  private realtimeConnected = false;
  private audioContext: AudioContext | null = null;
  private shouldScrollMessagesToBottom = false;
  private scrollMessagesFrame: number | null = null;
  private scrollMessagesRetryCount = 0;

  @ViewChild('chatMessagesViewport')
  private chatMessagesViewport?: ElementRef<HTMLElement>;

  private readonly authService = inject(AuthService);
  private readonly chatApi = inject(ChatApiService);
  private readonly chatRealtime = inject(ChatRealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly listingApi = inject(ListingApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isDeletingListing = signal(false);
  protected readonly isUpdatingOrder = signal(false);
  protected readonly isMessagesLoading = signal(false);
  protected readonly isSendingMessage = signal(false);
  protected readonly isUploadingAttachment = signal(false);
  protected readonly isSubmittingDispute = signal(false);
  protected readonly isSubmittingReview = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly listings = signal<ListingSummary[]>([]);
  protected readonly buyerOrders = signal<OrderSummary[]>([]);
  protected readonly soldOrders = signal<OrderSummary[]>([]);
  protected readonly chats = signal<ChatSummary[]>([]);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly activeTab = signal<ProfileTab>('products');
  protected readonly activeChatId = signal<string | null>(null);
  protected readonly isMobileChatListMode = signal(false);
  protected readonly firstUnreadIncomingMessageId = signal<string | null>(null);
  protected readonly requestedChatId = signal<string | null>(null);
  protected readonly requestedListingId = signal<string | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly selectedSort = signal<ListingSort>('newest');
  protected readonly selectedCondition = signal<ListingConditionFilter>('all');
  protected readonly selectedCategory = signal<ListingCategoryFilter>('all');
  protected readonly minPrice = signal('');
  protected readonly maxPrice = signal('');
  protected readonly soldSearchTerm = signal('');
  protected readonly soldSelectedSort = signal<SoldSort>('newest');
  protected readonly soldSelectedState = signal<SoldStateFilter>('all');
  protected readonly soldMinPrice = signal('');
  protected readonly soldMaxPrice = signal('');
  protected readonly orderSearchTerm = signal('');
  protected readonly orderSelectedSort = signal<BuyerOrderSort>('newest');
  protected readonly orderSelectedState = signal<BuyerOrderStateFilter>('all');
  protected readonly orderMinPrice = signal('');
  protected readonly orderMaxPrice = signal('');
  protected readonly chatRoleFilter = signal<ChatRoleFilter>('all');
  protected readonly messageDraft = signal('');
  protected readonly disputeReason = signal('');
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly isLogoutDialogOpen = signal(false);
  protected readonly isFilterMenuOpen = signal(false);
  protected readonly isSortMenuOpen = signal(false);
  protected readonly isSoldFilterMenuOpen = signal(false);
  protected readonly isSoldSortMenuOpen = signal(false);
  protected readonly isOrderFilterMenuOpen = signal(false);
  protected readonly isOrderSortMenuOpen = signal(false);
  protected readonly pendingDeleteListing = signal<ListingSummary | null>(null);
  protected readonly pendingCancelOrder = signal<OrderSummary | null>(null);
  protected readonly pendingReviewOrder = signal<OrderSummary | null>(null);
  protected readonly pendingDisputeReview = signal<Review | null>(null);
  protected readonly reviewedOrderIds = signal<Set<string>>(new Set());
  protected readonly hasUnseenSold = signal(false);
  protected readonly hasUnseenOrders = signal(false);
  protected readonly hasUnseenChats = signal(false);
  protected readonly hasUnseenReviews = signal(false);

  protected readonly tabs = computed(() => [
    { key: 'products' as const, label: 'Your products', hasDot: false },
    { key: 'sold' as const, label: 'Sold', hasDot: this.hasUnseenSold() },
    { key: 'orders' as const, label: 'Orders', hasDot: this.hasUnseenOrders() },
    { key: 'chats' as const, label: 'Chats', hasDot: this.hasUnseenChats() },
    { key: 'reviews' as const, label: 'Reviews', hasDot: this.hasUnseenReviews() }
  ]);

  protected readonly sortOptions = listingSortOptions;
  protected readonly soldSortOptions: Array<{ value: SoldSort; label: string }> = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'price-low', label: 'Cheapest' },
    { value: 'price-high', label: 'Most Expensive' }
  ];
  protected readonly soldStateOptions: Array<{ value: SoldStateFilter; label: string }> = [
    { value: 'all', label: 'Any status' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'awaiting-shipment', label: 'Awaiting shipment' },
    { value: 'in-delivery', label: 'In delivery' },
    { value: 'refusal', label: 'Refusal' },
    { value: 'sold', label: 'Sold' }
  ];
  protected readonly orderSortOptions: Array<{ value: BuyerOrderSort; label: string }> = this.soldSortOptions;
  protected readonly orderStateOptions: Array<{ value: BuyerOrderStateFilter; label: string }> = [
    { value: 'all', label: 'Any status' },
    { value: 'pending', label: 'Pending' },
    { value: 'in-delivery', label: 'In delivery' },
    { value: 'refusal', label: 'Refusal' },
    { value: 'arrived', label: 'Arrived' },
    { value: 'bought', label: 'Bought' }
  ];
  protected readonly conditionOptions = listingConditionFilterOptions;
  protected readonly categoryOptions = computed(() => {
    const categoryNames = new Set(
      this.listings()
        .map(listing => listing.categoryName.trim())
        .filter(Boolean)
    );

    return [
      { value: 'all', label: 'All Categories' },
      ...Array.from(categoryNames)
        .sort((left, right) => left.localeCompare(right))
        .map(categoryName => ({ value: categoryName, label: categoryName }))
    ];
  });
  protected readonly chatRoleOptions: Array<{ value: ChatRoleFilter; label: string }> = [
    { value: 'all', label: 'All chats' },
    { value: 'buying', label: 'Buying' },
    { value: 'selling', label: 'Selling' }
  ];

  protected readonly filteredListings = computed(() => {
    const normalizedSearchTerm = this.searchTerm().trim().toLowerCase();
    const selectedCategory = this.selectedCategory();
    const selectedCondition = this.selectedCondition();
    const selectedSort = this.selectedSort();
    const minPrice = Number.parseFloat(this.minPrice());
    const maxPrice = Number.parseFloat(this.maxPrice());

    const filtered = this.listings().filter(listing => {
      const matchesSearch =
        !normalizedSearchTerm || listing.title.toLowerCase().includes(normalizedSearchTerm);
      const matchesCategory =
        selectedCategory === 'all' || listing.categoryName === selectedCategory;
      const matchesCondition =
        selectedCondition === 'all' || listing.condition === selectedCondition;
      const matchesMinPrice = Number.isNaN(minPrice) || listing.price >= minPrice;
      const matchesMaxPrice = Number.isNaN(maxPrice) || listing.price <= maxPrice;

      return matchesSearch && matchesCategory && matchesCondition && matchesMinPrice && matchesMaxPrice;
    });

    return [...filtered].sort((left, right) => {
      switch (selectedSort) {
        case 'oldest':
          return new Date(left.createdAtUtc).getTime() - new Date(right.createdAtUtc).getTime();
        case 'price-low':
          return left.price - right.price;
        case 'price-high':
          return right.price - left.price;
        default:
          return new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime();
      }
    });
  });

  protected readonly filteredSoldOrders = computed(() => {
    const normalizedSearchTerm = this.soldSearchTerm().trim().toLowerCase();
    const selectedState = this.soldSelectedState();
    const selectedSort = this.soldSelectedSort();
    const minPrice = Number.parseFloat(this.soldMinPrice());
    const maxPrice = Number.parseFloat(this.soldMaxPrice());

    const filtered = this.soldOrders().filter(order => {
      const matchesSearch =
        !normalizedSearchTerm ||
        order.listingTitle.toLowerCase().includes(normalizedSearchTerm) ||
        order.counterpartyName.toLowerCase().includes(normalizedSearchTerm);
      const state = this.soldOrderState(order);
      const matchesState = selectedState === 'all' || state === selectedState;
      const matchesMinPrice = Number.isNaN(minPrice) || order.totalAmount >= minPrice;
      const matchesMaxPrice = Number.isNaN(maxPrice) || order.totalAmount <= maxPrice;

      return matchesSearch && matchesState && matchesMinPrice && matchesMaxPrice;
    });

    return [...filtered].sort((left, right) => {
      switch (selectedSort) {
        case 'oldest':
          return new Date(left.createdAtUtc).getTime() - new Date(right.createdAtUtc).getTime();
        case 'price-low':
          return left.totalAmount - right.totalAmount;
        case 'price-high':
          return right.totalAmount - left.totalAmount;
        default:
          return new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime();
      }
    });
  });

  protected readonly filteredBuyerOrders = computed(() => {
    const normalizedSearchTerm = this.orderSearchTerm().trim().toLowerCase();
    const selectedState = this.orderSelectedState();
    const selectedSort = this.orderSelectedSort();
    const minPrice = Number.parseFloat(this.orderMinPrice());
    const maxPrice = Number.parseFloat(this.orderMaxPrice());

    const filtered = this.buyerOrders().filter(order => {
      const matchesSearch =
        !normalizedSearchTerm ||
        order.listingTitle.toLowerCase().includes(normalizedSearchTerm) ||
        order.deliveryAddress.toLowerCase().includes(normalizedSearchTerm);
      const state = this.buyerOrderState(order);
      const matchesState = selectedState === 'all' || state === selectedState;
      const matchesMinPrice = Number.isNaN(minPrice) || order.totalAmount >= minPrice;
      const matchesMaxPrice = Number.isNaN(maxPrice) || order.totalAmount <= maxPrice;

      return matchesSearch && matchesState && matchesMinPrice && matchesMaxPrice;
    });

    return [...filtered].sort((left, right) => {
      switch (selectedSort) {
        case 'oldest':
          return new Date(left.createdAtUtc).getTime() - new Date(right.createdAtUtc).getTime();
        case 'price-low':
          return left.totalAmount - right.totalAmount;
        case 'price-high':
          return right.totalAmount - left.totalAmount;
        default:
          return new Date(right.createdAtUtc).getTime() - new Date(left.createdAtUtc).getTime();
      }
    });
  });

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.profile-toolbar__dropdown-wrap')) {
      this.isSortMenuOpen.set(false);
      this.isFilterMenuOpen.set(false);
      this.isSoldSortMenuOpen.set(false);
      this.isSoldFilterMenuOpen.set(false);
      this.isOrderSortMenuOpen.set(false);
      this.isOrderFilterMenuOpen.set(false);
    }
  }

  protected readonly visibleChats = computed(() => {
    const roleFilter = this.chatRoleFilter();
    const chats = [...this.chats()];

    const filtered =
      roleFilter === 'all'
        ? chats
        : chats.filter(chat => {
            if (chat.isSupport) {
              return false;
            }

            return roleFilter === 'selling' ? chat.isSellerView : !chat.isSellerView;
          });

    return filtered.sort(
      (left, right) =>
        new Date(right.lastMessageAtUtc).getTime() - new Date(left.lastMessageAtUtc).getTime()
    );
  });

  protected readonly activeChat = computed(() => {
    const activeChatId = this.activeChatId();
    return activeChatId ? this.chats().find(chat => chat.id === activeChatId) ?? null : null;
  });

  protected readonly canSendMessage = computed(() => {
    return !!this.activeChatId() && this.messageDraft().trim().length > 0 && !this.isSendingMessage() && !this.isUploadingAttachment();
  });

  protected readonly reviewAverage = computed(() => {
    const reviews = this.reviews();
    if (reviews.length === 0) {
      return this.profile()?.averageRating ?? 0;
    }

    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    return Math.round(average * 100) / 100;
  });

  protected readonly roundedReviewAverage = computed(() => Math.round(this.reviewAverage()));

  protected readonly reviewAverageLabel = computed(() => {
    const average = this.reviewAverage();
    return `${Number.isInteger(average) ? average.toFixed(1) : average}/5`;
  });

  protected readonly userInitial = computed(() => {
    const userName = this.profile()?.userName?.trim();
    return userName ? userName.charAt(0).toUpperCase() : 'B';
  });

  protected readonly activeChatInitial = computed(() => {
    const userName = this.activeChat()?.counterpartyName?.trim();
    return userName ? userName.charAt(0).toUpperCase() : 'B';
  });

  protected readonly currentTabLabel = computed(() => {
    return this.tabs().find(tab => tab.key === this.activeTab())?.label ?? 'Profile';
  });

  constructor() {
    this.chatRealtime.messageReceived$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(message => {
        const currentUserId = this.authService.currentUser()?.id;
        if (!currentUserId) {
          return;
        }

        if (message.chatId === this.activeChatId()) {
          if (message.senderId !== currentUserId) {
            this.playIncomingMessageSound();
          }

          this.chatMessages.update(items =>
            items.some(item => item.id === message.id) ? items : [...items, message]
          );
          this.queueMessagesScrollToBottom();

          if (message.senderId !== currentUserId) {
            this.firstUnreadIncomingMessageId.set(null);
            this.loadMessages(message.chatId, true, false);
          }
        }
      });

    this.chatRealtime.summaryUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(summary => {
        const previousSummary = this.chats().find(item => item.id === summary.id);
        const shouldPlaySound =
          summary.id !== this.activeChatId() &&
          summary.unreadCount > 0 &&
          summary.unreadCount > (previousSummary?.unreadCount ?? 0);

        this.chats.update(items => this.sortChatsByLatest([
          ...items.filter(item => item.id !== summary.id),
          summary
        ]));
        this.refreshTabIndicators();

        if (summary.id === this.activeChatId()) {
          this.loadMessages(summary.id, true, false);
        }

        if (shouldPlaySound) {
          this.playIncomingMessageSound();
        }
      });

    this.destroyRef.onDestroy(() => {
      this.shouldScrollMessagesToBottom = false;
      if (this.scrollMessagesFrame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(this.scrollMessagesFrame);
        this.scrollMessagesFrame = null;
      }

      if (this.joinedChatId) {
        void this.chatRealtime.leaveChat(this.joinedChatId);
      }

      if (this.realtimeConnected) {
        void this.chatRealtime.disconnect();
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tab = params.get('tab');
      if (this.isProfileTab(tab)) {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('products');
      }

      this.requestedChatId.set(params.get('chatId'));
      this.requestedListingId.set(params.get('listingId'));

      if (!this.isLoading()) {
        this.handleActiveTabChanged();
      }
    });

    this.loadPage();
  }

  protected setActiveTab(tab: ProfileTab): void {
    this.activeTab.set(tab);

    if (tab !== 'chats') {
      this.requestedChatId.set(null);
      this.requestedListingId.set(null);
    }

    this.handleActiveTabChanged();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: tab === 'products' ? null : tab,
        chatId: tab === 'chats' ? this.activeChatId() : null,
        listingId: tab === 'chats' ? this.requestedListingId() : null
      },
      queryParamsHandling: 'merge'
    });
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected applySearch(): void {
    this.searchTerm.set(this.searchTerm().trim());
  }

  protected updateSoldSearch(value: string): void {
    this.soldSearchTerm.set(value);
  }

  protected applySoldSearch(): void {
    this.soldSearchTerm.set(this.soldSearchTerm().trim());
  }

  protected updateOrderSearch(value: string): void {
    this.orderSearchTerm.set(value);
  }

  protected applyOrderSearch(): void {
    this.orderSearchTerm.set(this.orderSearchTerm().trim());
  }

  protected updateSort(value: ListingSort): void {
    this.selectedSort.set(value);
  }

  protected applySort(): void {
    this.isSortMenuOpen.set(false);
  }

  protected resetSort(): void {
    this.selectedSort.set('newest');
    this.isSortMenuOpen.set(false);
  }

  protected updateSoldSort(value: SoldSort): void {
    this.soldSelectedSort.set(value);
  }

  protected applySoldSort(): void {
    this.isSoldSortMenuOpen.set(false);
  }

  protected resetSoldSort(): void {
    this.soldSelectedSort.set('newest');
    this.isSoldSortMenuOpen.set(false);
  }

  protected updateOrderSort(value: BuyerOrderSort): void {
    this.orderSelectedSort.set(value);
  }

  protected applyOrderSort(): void {
    this.isOrderSortMenuOpen.set(false);
  }

  protected resetOrderSort(): void {
    this.orderSelectedSort.set('newest');
    this.isOrderSortMenuOpen.set(false);
  }

  protected updateCondition(value: ListingConditionFilter): void {
    this.selectedCondition.set(value);
  }

  protected updateCategory(value: ListingCategoryFilter): void {
    this.selectedCategory.set(value);
  }

  protected updateMinPrice(value: unknown): void {
    this.minPrice.set(String(value ?? ''));
  }

  protected updateMaxPrice(value: unknown): void {
    this.maxPrice.set(String(value ?? ''));
  }

  protected updateSoldState(value: SoldStateFilter): void {
    this.soldSelectedState.set(value);
  }

  protected updateSoldMinPrice(value: unknown): void {
    this.soldMinPrice.set(String(value ?? ''));
  }

  protected updateSoldMaxPrice(value: unknown): void {
    this.soldMaxPrice.set(String(value ?? ''));
  }

  protected updateOrderState(value: BuyerOrderStateFilter): void {
    this.orderSelectedState.set(value);
  }

  protected updateOrderMinPrice(value: unknown): void {
    this.orderMinPrice.set(String(value ?? ''));
  }

  protected updateOrderMaxPrice(value: unknown): void {
    this.orderMaxPrice.set(String(value ?? ''));
  }

  protected setChatRoleFilter(value: ChatRoleFilter): void {
    this.chatRoleFilter.set(value);

    const activeChatId = this.activeChatId();
    if (activeChatId && this.visibleChats().some(chat => chat.id === activeChatId)) {
      return;
    }

    if (this.isMobileViewport()) {
      this.isMobileChatListMode.set(true);
      this.activeChatId.set(null);
      this.chatMessages.set([]);
      return;
    }

    const fallbackChat = this.visibleChats()[0];
    if (fallbackChat) {
      this.openChat(fallbackChat.id);
      return;
    }

    this.activeChatId.set(null);
    this.chatMessages.set([]);
  }

  protected updateMessageDraft(value: string): void {
    this.messageDraft.set(value);
  }

  protected attachmentUrl(message: ChatMessage): string | null {
    return resolveApiUrl(message.attachmentUrl);
  }

  protected isImageMessage(message: ChatMessage): boolean {
    return message.type === 'Image';
  }

  protected shouldShowDateDivider(index: number): boolean {
    const messages = this.chatMessages();
    const currentMessage = messages[index];
    const previousMessage = messages[index - 1];
    if (!currentMessage) {
      return false;
    }

    if (!previousMessage) {
      return true;
    }

    return this.messageDateKey(currentMessage) !== this.messageDateKey(previousMessage);
  }

  protected shouldShowNewMarker(index: number): boolean {
    const message = this.chatMessages()[index];
    return !!message && message.id === this.firstUnreadIncomingMessageId();
  }

  protected isLastReadOwnMessage(message: ChatMessage, index: number): boolean {
    if (!this.isOwnMessage(message) || !message.readAtUtc) {
      return false;
    }

    const messages = this.chatMessages();
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const item = messages[messageIndex];
      if (this.isOwnMessage(item) && item.readAtUtc) {
        return messageIndex === index;
      }
    }

    return false;
  }

  protected attachmentKind(message: ChatMessage): 'pdf' | 'doc' | 'txt' | 'zip' | 'file' | 'unknown' {
    const extension = this.attachmentExtension(message);
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'doc':
      case 'docx':
        return 'doc';
      case 'txt':
        return 'txt';
      case 'zip':
        return 'zip';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'webp':
      case 'gif':
        return 'file';
      default:
        return extension ? 'unknown' : 'file';
    }
  }

  protected attachmentIconLabel(message: ChatMessage): string {
    switch (this.attachmentKind(message)) {
      case 'pdf':
        return 'PDF';
      case 'doc':
        return 'DOC';
      case 'txt':
        return 'TXT';
      case 'zip':
        return 'ZIP';
      case 'unknown':
        return '???';
      default:
        return 'FILE';
    }
  }

  protected attachmentTypeLabel(message: ChatMessage): string {
    switch (this.attachmentKind(message)) {
      case 'pdf':
        return 'PDF document';
      case 'doc':
        return 'Word document';
      case 'txt':
        return 'Text file';
      case 'zip':
        return 'Archive';
      case 'unknown':
        return 'Unknown file type';
      default:
        return 'File attachment';
    }
  }

  protected updateDisputeReason(value: string): void {
    this.disputeReason.set(value);
  }

  protected toggleSortMenu(event?: Event): void {
    event?.stopPropagation();
    this.isSortMenuOpen.update(value => !value);
    this.isFilterMenuOpen.set(false);
  }

  protected toggleFilterMenu(event?: Event): void {
    event?.stopPropagation();
    this.isFilterMenuOpen.update(value => !value);
    this.isSortMenuOpen.set(false);
  }

  protected toggleSoldSortMenu(event?: Event): void {
    event?.stopPropagation();
    this.isSoldSortMenuOpen.update(value => !value);
    this.isSoldFilterMenuOpen.set(false);
  }

  protected toggleSoldFilterMenu(event?: Event): void {
    event?.stopPropagation();
    this.isSoldFilterMenuOpen.update(value => !value);
    this.isSoldSortMenuOpen.set(false);
  }

  protected toggleOrderSortMenu(event?: Event): void {
    event?.stopPropagation();
    this.isOrderSortMenuOpen.update(value => !value);
    this.isOrderFilterMenuOpen.set(false);
  }

  protected toggleOrderFilterMenu(event?: Event): void {
    event?.stopPropagation();
    this.isOrderFilterMenuOpen.update(value => !value);
    this.isOrderSortMenuOpen.set(false);
  }

  protected closeFilterMenu(): void {
    this.isFilterMenuOpen.set(false);
  }

  protected applyFilters(): void {
    this.isFilterMenuOpen.set(false);
  }

  protected resetFilters(): void {
    this.selectedCategory.set('all');
    this.selectedCondition.set('all');
    this.minPrice.set('');
    this.maxPrice.set('');
    this.isFilterMenuOpen.set(false);
  }

  protected applySoldFilters(): void {
    this.isSoldFilterMenuOpen.set(false);
  }

  protected resetSoldFilters(): void {
    this.soldSelectedState.set('all');
    this.soldMinPrice.set('');
    this.soldMaxPrice.set('');
    this.isSoldFilterMenuOpen.set(false);
  }

  protected applyOrderFilters(): void {
    this.isOrderFilterMenuOpen.set(false);
  }

  protected resetOrderFilters(): void {
    this.orderSelectedState.set('all');
    this.orderMinPrice.set('');
    this.orderMaxPrice.set('');
    this.isOrderFilterMenuOpen.set(false);
  }

  protected openEditProfile(): void {
    void this.router.navigateByUrl('/profile/edit');
  }

  protected openAddProduct(): void {
    void this.router.navigateByUrl('/listings/new');
  }

  protected browseProducts(): void {
    void this.router.navigateByUrl('/products');
  }

  protected goToCart(): void {
    void this.router.navigateByUrl('/cart');
  }

  protected contactSupport(): void {
    this.chatApi
      .startSupportChat()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.chats.update(items => this.sortChatsByLatest([
            ...items.filter(item => item.id !== response.chat.id),
            response.chat
          ]));
          this.chatRoleFilter.set('all');
          this.setActiveTab('chats');
          this.openChat(response.chat.id);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to open support chat right now.')
          );
        }
      });
  }

  protected requestSupportAdmin(chat: ChatSummary, event: MouseEvent): void {
    event.stopPropagation();
    if (!chat.isSupport || chat.supportStatus !== 'BotActive') {
      return;
    }

    this.chatApi
      .requestSupportAdmin(chat.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedChat => {
          this.chats.update(items => this.sortChatsByLatest([
            ...items.filter(item => item.id !== updatedChat.id),
            updatedChat
          ]));
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to call an operator right now.')
          );
        }
      });
  }

  protected openListing(listingId: string): void {
    openRouteInNewTab(this.router, ['/listings', listingId]);
  }

  protected openListingEditor(listingId: string, event?: Event): void {
    event?.stopPropagation();
    void this.router.navigate(['/listings', listingId, 'edit']);
  }

  protected canEditListing(listing: ListingSummary): boolean {
    return !listing.hasActiveOrders && (
      listing.status === 'Published' ||
      listing.status === 'Active' ||
      listing.status === 'Draft'
    );
  }

  protected requestDeleteListing(listing: ListingSummary, event?: Event): void {
    event?.stopPropagation();
    this.pendingDeleteListing.set(listing);
  }

  protected closeDeleteDialog(): void {
    this.pendingDeleteListing.set(null);
  }

  protected confirmDeleteListing(): void {
    const listing = this.pendingDeleteListing();
    if (!listing) {
      return;
    }

    this.isDeletingListing.set(true);
    this.errorMessage.set(null);

    this.listingApi
      .deleteListing(listing.id)
      .pipe(finalize(() => this.isDeletingListing.set(false)))
      .subscribe({
        next: () => {
          this.listings.update(items => items.filter(item => item.id !== listing.id));
          this.profile.update(profile =>
            profile
              ? {
                  ...profile,
                  activeListingsCount: Math.max(profile.activeListingsCount - 1, 0)
                }
              : profile
          );
          this.pendingDeleteListing.set(null);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to delete the listing right now.')
          );
        }
      });
  }

  protected openShipmentConfirmation(orderId: string): void {
    void this.router.navigate(['/orders', orderId, 'shipment-confirmation']);
  }

  protected openSellerOrder(orderId: string): void {
    void this.router.navigate(['/orders', orderId, 'seller-track']);
  }

  protected openBuyerOrder(orderId: string): void {
    void this.router.navigate(['/orders', orderId, 'track']);
  }

  protected requestCancelOrder(order: OrderSummary): void {
    this.pendingCancelOrder.set(order);
  }

  protected closeCancelOrderDialog(): void {
    this.pendingCancelOrder.set(null);
  }

  protected confirmCancelOrder(): void {
    const order = this.pendingCancelOrder();
    if (!order) {
      return;
    }

    this.isUpdatingOrder.set(true);
    this.orderApi
      .cancelOrder(order.id)
      .pipe(finalize(() => this.isUpdatingOrder.set(false)))
      .subscribe({
        next: updatedOrder => {
          this.buyerOrders.update(items =>
            items.map(item =>
              item.id === updatedOrder.id
                ? {
                    ...item,
                    status: updatedOrder.status,
                    shipmentStatus: updatedOrder.shipment?.status ?? null
                  }
                : item
            )
          );
          this.refreshTabIndicators();
          this.markTabAsSeen('orders');
          this.pendingCancelOrder.set(null);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to refuse the order right now.'));
        }
      });
  }

  protected requestReviewOrder(order: OrderSummary): void {
    if (!this.canReviewBuyerOrder(order)) {
      return;
    }

    this.pendingReviewOrder.set(order);
    this.reviewRating.set(5);
    this.reviewComment.set('');
  }

  protected closeReviewDialog(): void {
    this.pendingReviewOrder.set(null);
    this.reviewRating.set(5);
    this.reviewComment.set('');
  }

  protected confirmReviewOrder(): void {
    const order = this.pendingReviewOrder();
    const comment = this.reviewComment().trim();
    if (!order || !comment) {
      return;
    }

    this.isSubmittingReview.set(true);
    this.reviewApi
      .createReview({
        orderId: order.id,
        targetUserId: order.sellerId,
        rating: this.reviewRating(),
        comment
      })
      .pipe(finalize(() => this.isSubmittingReview.set(false)))
      .subscribe({
        next: () => {
          this.reviewedOrderIds.update(items => new Set([...items, order.id]));
          this.buyerOrders.update(items =>
            items.map(item =>
              item.id === order.id ? { ...item, hasReviewFromCurrentUser: true } : item
            )
          );
          this.closeReviewDialog();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to submit the review right now.'));
        }
      });
  }

  protected requestDisputeReview(review: Review): void {
    if (!this.canDisputeReview(review)) {
      return;
    }

    this.pendingDisputeReview.set(review);
    this.disputeReason.set('');
  }

  protected closeDisputeDialog(): void {
    this.pendingDisputeReview.set(null);
    this.disputeReason.set('');
  }

  protected confirmDisputeReview(): void {
    const review = this.pendingDisputeReview();
    const reason = this.disputeReason().trim();
    if (!review || !reason) {
      return;
    }

    this.isSubmittingDispute.set(true);
    this.reviewApi
      .disputeReview(review.id, { reason })
      .pipe(finalize(() => this.isSubmittingDispute.set(false)))
      .subscribe({
        next: updatedReview => {
          this.reviews.update(items =>
            items.map(item => (item.id === updatedReview.id ? updatedReview : item))
          );
          this.refreshTabIndicators();
          this.markTabAsSeen('reviews');
          this.closeDisputeDialog();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to dispute the review right now.'));
        }
      });
  }

  protected requestLogout(): void {
    this.isLogoutDialogOpen.set(true);
  }

  protected closeLogoutDialog(): void {
    this.isLogoutDialogOpen.set(false);
  }

  protected confirmLogout(): void {
    this.authService.logout();
    this.isLogoutDialogOpen.set(false);
    void this.router.navigateByUrl('/auth');
  }

  protected openChat(chatId: string): void {
    const targetChat = this.chats().find(chat => chat.id === chatId);
    if (targetChat?.isSupport) {
      this.chatRoleFilter.set('all');
    }

    this.activeChatId.set(chatId);
    this.isMobileChatListMode.set(false);
    this.requestedChatId.set(chatId);
    this.requestedListingId.set(null);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: 'chats',
        chatId,
        listingId: null
      },
      queryParamsHandling: 'merge'
    });

    this.loadMessages(chatId);
  }

  protected closeMobileChat(event?: MouseEvent): void {
    event?.stopPropagation();
    this.activeChatId.set(null);
    this.isMobileChatListMode.set(true);
    this.requestedChatId.set(null);
    this.firstUnreadIncomingMessageId.set(null);
    this.chatMessages.set([]);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: 'chats',
        chatId: null,
        listingId: null
      },
      queryParamsHandling: 'merge'
    });
  }

  protected isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  }

  protected sendMessage(): void {
    const chatId = this.activeChatId();
    const content = this.messageDraft().trim();
    if (!chatId || !content) {
      return;
    }

    this.isSendingMessage.set(true);
    this.chatApi
      .sendMessage(chatId, { content })
      .pipe(finalize(() => this.isSendingMessage.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: message => {
          this.chatMessages.update(items =>
            items.some(item => item.id === message.id) ? items : [...items, message]
          );
          this.queueMessagesScrollToBottom();
          this.messageDraft.set('');
          this.firstUnreadIncomingMessageId.set(null);
          this.chats.update(items => this.sortChatsByLatest([
            ...items.filter(item => item.id !== chatId),
            {
              ...(items.find(item => item.id === chatId) ?? this.activeChat()!),
              lastMessagePreview: message.content || this.messageTypeLabel(message.type),
              lastMessageAtUtc: message.sentAtUtc
            }
          ]));
          this.refreshTabIndicators();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to send the message right now.'));
        }
      });
  }

  protected sendAttachment(fileInput: HTMLInputElement): void {
    const chatId = this.activeChatId();
    const file = fileInput.files?.[0];
    if (!chatId || !file) {
      return;
    }

    const content = this.messageDraft().trim();
    this.isUploadingAttachment.set(true);
    this.chatApi
      .uploadAttachment(chatId, file)
      .pipe(
        switchMap(uploaded =>
          this.chatApi.sendMessage(chatId, {
            content,
            attachmentUrl: uploaded.attachmentUrl,
            type: uploaded.type
          })
        ),
        finalize(() => {
          this.isUploadingAttachment.set(false);
          fileInput.value = '';
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: message => {
          this.chatMessages.update(items =>
            items.some(item => item.id === message.id) ? items : [...items, message]
          );
          this.queueMessagesScrollToBottom();
          this.messageDraft.set('');
          this.firstUnreadIncomingMessageId.set(null);
          this.chats.update(items => this.sortChatsByLatest([
            ...items.filter(item => item.id !== chatId),
            {
              ...(items.find(item => item.id === chatId) ?? this.activeChat()!),
              lastMessagePreview: message.content || this.messageTypeLabel(message.type),
              lastMessageAtUtc: message.sentAtUtc
            }
          ]));
          this.refreshTabIndicators();
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to send the attachment right now.')
          );
        }
      });
  }

  protected openChatListing(chat: ChatSummary): void {
    if (!chat.listingId) {
      return;
    }

    openRouteInNewTab(this.router, ['/listings', chat.listingId]);
  }

  protected openChatCheckout(chat: ChatSummary, event: MouseEvent): void {
    event.stopPropagation();
    if (!chat.listingId) {
      return;
    }

    void this.router.navigate(['/checkout/listing', chat.listingId]);
  }

  protected openPublicProfile(userId: string): void {
    void this.router.navigate(['/sellers', userId]);
  }

  protected avatarUrl(): string | null {
    return resolveApiUrl(this.profile()?.profileImageUrl);
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

  protected chatListingImageUrl(chat?: ChatSummary | null): string | null {
    return resolveApiUrl(chat?.listingPrimaryImageUrl);
  }

  protected chatProductLocation(chat: ChatSummary): string {
    return this.findChatListing(chat)?.city ?? this.findChatOrder(chat)?.deliveryCity ?? 'Marketplace';
  }

  protected chatProductPrice(chat: ChatSummary): number | null {
    const listing = this.findChatListing(chat);
    if (listing) {
      return listing.price;
    }

    const order = this.findChatOrder(chat);
    return order ? order.totalAmount : null;
  }

  protected isOwnMessage(message: ChatMessage): boolean {
    return message.senderId === this.authService.currentUser()?.id;
  }

  protected formatCondition(condition: ListingCondition): string {
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

  protected canAcceptOrder(order: OrderSummary): boolean {
    return canSellerAccept(order.status);
  }

  protected canTrackSoldOrder(order: OrderSummary): boolean {
    return canSellerTrack(order.status);
  }

  protected canCancelBuyerOrder(order: OrderSummary): boolean {
    return canBuyerCancel(order.status);
  }

  protected canRefuseBuyerOrder(order: OrderSummary): boolean {
    const state = this.buyerOrderState(order);
    return state === 'pending' || state === 'in-delivery';
  }

  protected canReviewBuyerOrder(order: OrderSummary): boolean {
    return (
      this.buyerOrderState(order) === 'bought' &&
      !order.hasReviewFromCurrentUser &&
      !this.reviewedOrderIds().has(order.id)
    );
  }

  protected buyerOrderState(order: OrderSummary): BuyerOrderState {
    if (order.status === 'Declined' || order.status === 'Cancelled' || order.shipmentStatus === 'Cancelled') {
      return 'refusal';
    }

    if (order.status === 'Delivered') {
      return 'bought';
    }

    if (order.shipmentStatus === 'Arrived') {
      return 'arrived';
    }

    if (order.status === 'Shipped' || order.shipmentStatus === 'InDelivery') {
      return 'in-delivery';
    }

    return 'pending';
  }

  protected buyerOrderStateLabel(order: OrderSummary): string {
    switch (this.buyerOrderState(order)) {
      case 'in-delivery':
        return 'In delivery';
      case 'refusal':
        return 'Refusal';
      case 'arrived':
        return 'Arrived';
      case 'bought':
        return 'Bought';
      default:
        return 'Pending';
    }
  }

  protected updateReviewRating(value: unknown): void {
    const numericValue = Number.parseInt(String(value), 10);
    if (Number.isNaN(numericValue)) {
      this.reviewRating.set(5);
      return;
    }

    this.reviewRating.set(Math.min(Math.max(numericValue, 1), 5));
  }

  protected updateReviewComment(value: string): void {
    this.reviewComment.set(value);
  }

  protected soldOrderState(order: OrderSummary): SoldOrderState {
    if (order.status === 'Declined' || order.status === 'Cancelled' || order.shipmentStatus === 'Cancelled') {
      return 'refusal';
    }

    if (order.status === 'Delivered' || order.shipmentStatus === 'Arrived') {
      return 'sold';
    }

    if (order.status === 'Shipped' || order.shipmentStatus === 'InDelivery') {
      return 'in-delivery';
    }

    if (order.status === 'Accepted' || order.shipmentStatus === 'ReadyToShip') {
      return 'awaiting-shipment';
    }

    return 'ordered';
  }

  protected soldOrderStateLabel(order: OrderSummary): string {
    switch (this.soldOrderState(order)) {
      case 'awaiting-shipment':
        return 'Awaiting shipment';
      case 'in-delivery':
        return 'In delivery';
      case 'refusal':
        return 'Refusal';
      case 'sold':
        return 'Sold';
      default:
        return 'Ordered';
    }
  }

  protected canDisputeReview(review: Review): boolean {
    return review.targetUserId === this.profile()?.id && review.status !== 'Disputed';
  }

  protected ratingLabel(rating: number): string {
    return `${rating}/5`;
  }

  protected reviewStars(_rating: number): number[] {
    return [1, 2, 3, 4, 5];
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

  protected messageTypeLabel(type: ChatMessage['type']): string {
    switch (type) {
      case 'Image':
        return 'Image';
      case 'File':
        return 'File';
      default:
        return 'Text';
    }
  }

  private loadPage(): void {
    this.profileApi
      .getMyProfile()
      .pipe(
        switchMap(profile =>
          forkJoin({
            profile: of(profile),
            listings: this.listingApi.getMyListings(),
            buyerOrders: this.orderApi.getMyOrders(),
            soldOrders: this.orderApi.getMyOrders(true),
            chats: this.chatApi.getMyChats(),
            reviews: this.reviewApi.getUserReviews(profile.id)
          })
        ),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: ({ profile, listings, buyerOrders, soldOrders, chats, reviews }) => {
          this.profile.set(profile);
          this.listings.set(listings);
          this.buyerOrders.set(buyerOrders);
          this.soldOrders.set(soldOrders);
          this.chats.set(this.sortChatsByLatest(chats));
          this.reviews.set(reviews);
          this.refreshTabIndicators();
          this.initializeRealtime();
          this.startLiveRefresh();
          this.handleActiveTabChanged();
          this.authService.updateCurrentUser({
            userName: profile.userName,
            email: profile.email,
            profileImageUrl: profile.profileImageUrl
          });
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load the profile right now.')
          );
        }
      });
  }

  private handleActiveTabChanged(): void {
    const activeTab = this.activeTab();

    if (activeTab === 'chats') {
      this.initializeRealtime();
      this.prepareChatsView();
      return;
    }

    if (activeTab === 'reviews') {
      this.markTabAsSeen('reviews');
      return;
    }

    if (activeTab === 'orders') {
      this.markTabAsSeen('orders');
      return;
    }

    if (activeTab === 'sold') {
      this.markTabAsSeen('sold');
    }
  }

  private startLiveRefresh(): void {
    timer(20000, 20000)
      .pipe(
        switchMap(() =>
          forkJoin({
            listings: this.listingApi.getMyListings(),
            buyerOrders: this.orderApi.getMyOrders(),
            soldOrders: this.orderApi.getMyOrders(true),
            reviews: this.profile()
              ? this.reviewApi.getUserReviews(this.profile()!.id)
              : of<Review[]>([])
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ listings, buyerOrders, soldOrders, reviews }) => {
          this.listings.set(listings);
          this.buyerOrders.set(buyerOrders);
          this.soldOrders.set(soldOrders);
          this.reviews.set(reviews);
          this.refreshTabIndicators();
        }
      });
  }

  private prepareChatsView(): void {
    if (this.isPreparingRequestedChat || this.isLoading()) {
      return;
    }

    const requestedListingId = this.requestedListingId();
    if (requestedListingId) {
      this.isPreparingRequestedChat = true;
      this.chatApi
        .startChat({ listingId: requestedListingId })
        .pipe(
          finalize(() => {
            this.isPreparingRequestedChat = false;
            this.requestedListingId.set(null);
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: chat => {
            this.chats.update(items => this.sortChatsByLatest([
              ...items.filter(item => item.id !== chat.id),
              chat
            ]));
            this.openChat(chat.id);
          },
          error: error => {
            this.errorMessage.set(
              extractApiError(error, 'Unable to open the chat with this seller right now.')
            );
          }
        });
      return;
    }

    const requestedChatId = this.requestedChatId();
    if (
      !requestedChatId &&
      !requestedListingId &&
      this.isMobileViewport() &&
      (this.isMobileChatListMode() || !this.activeChatId())
    ) {
      this.activeChatId.set(null);
      this.chatMessages.set([]);
      this.refreshTabIndicators();
      return;
    }

    const candidateChatId =
      (requestedChatId && this.chats().some(chat => chat.id === requestedChatId)
        ? requestedChatId
        : null) ??
      (this.activeChatId() && this.chats().some(chat => chat.id === this.activeChatId())
        ? this.activeChatId()
        : null) ??
      this.visibleChats()[0]?.id ??
      this.chats()[0]?.id ??
      null;

    if (!candidateChatId) {
      this.activeChatId.set(null);
      this.chatMessages.set([]);
      this.refreshTabIndicators();
      return;
    }

    if (candidateChatId !== this.activeChatId()) {
      this.openChat(candidateChatId);
      return;
    }

    if (!this.isMessagesLoading() && this.chatMessages().length === 0) {
      this.loadMessages(candidateChatId);
    }
  }

  private loadMessages(chatId: string, keepLoadingState = false, showUnreadMarker = true): void {
    if (!keepLoadingState) {
      this.isMessagesLoading.set(true);
    }

    const unreadCountBeforeOpen =
      this.chats().find(chat => chat.id === chatId)?.unreadCount ?? 0;

    this.chatApi
      .getMessages(chatId)
      .pipe(
        finalize(() => {
          if (!keepLoadingState) {
            this.isMessagesLoading.set(false);
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: messages => {
          this.activeChatId.set(chatId);
          this.chatMessages.set(messages);
          this.queueMessagesScrollToBottom();
          const firstUnreadMessageId =
            showUnreadMarker && unreadCountBeforeOpen > 0
              ? this.findFirstUnreadIncomingMessageId(messages, unreadCountBeforeOpen)
              : keepLoadingState && messages.some(message => message.id === this.firstUnreadIncomingMessageId())
                ? this.firstUnreadIncomingMessageId()
                : null;

          this.firstUnreadIncomingMessageId.set(firstUnreadMessageId);
          this.chats.update(items =>
            items.map(item => (item.id === chatId ? { ...item, unreadCount: 0 } : item))
          );
          this.refreshTabIndicators();
          this.joinActiveChat(chatId);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load chat messages right now.')
          );
        }
      });
  }

  private refreshTabIndicators(): void {
    this.hasUnseenOrders.set(
      this.hasUnseenBySignatures('orders', this.buildOrderSignatures(this.buyerOrders()))
    );
    this.hasUnseenSold.set(
      this.hasUnseenBySignatures('sold', this.buildOrderSignatures(this.soldOrders()))
    );
    this.hasUnseenChats.set(this.chats().some(chat => chat.unreadCount > 0));
    this.hasUnseenReviews.set(
      this.hasUnseenBySignatures('reviews', this.buildReviewSignatures(this.reviews()))
    );
  }

  private markTabAsSeen(tab: ProfileTab): void {
    switch (tab) {
      case 'orders':
        this.persistSeenSignatures('orders', this.buildOrderSignatures(this.buyerOrders()));
        this.hasUnseenOrders.set(false);
        break;
      case 'sold':
        this.persistSeenSignatures('sold', this.buildOrderSignatures(this.soldOrders()));
        this.hasUnseenSold.set(false);
        break;
      case 'reviews':
        this.persistSeenSignatures('reviews', this.buildReviewSignatures(this.reviews()));
        this.hasUnseenReviews.set(false);
        break;
      default:
        break;
    }
  }

  private hasUnseenBySignatures(tab: SeenStorageTab, signatures: string[]): boolean {
    if (signatures.length === 0) {
      return false;
    }

    const seenSignatures = new Set(this.readSeenSignatures(tab));
    return signatures.some(signature => !seenSignatures.has(signature));
  }

  private persistSeenSignatures(tab: SeenStorageTab, signatures: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.buildStorageKey(tab), JSON.stringify(signatures));
  }

  private readSeenSignatures(tab: SeenStorageTab): string[] {
    if (typeof window === 'undefined') {
      return [];
    }

    const rawValue = window.localStorage.getItem(this.buildStorageKey(tab));
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
    } catch {
      return [];
    }
  }

  private buildStorageKey(tab: SeenStorageTab): string {
    const userId = this.profile()?.id ?? this.authService.currentUser()?.id ?? 'guest';
    return `${this.tabSeenStoragePrefix}.${userId}.${tab}`;
  }

  private buildOrderSignatures(items: OrderSummary[]): string[] {
    return items.map(item =>
      [
        item.id,
        item.status,
        item.shipmentStatus ?? 'none',
        item.totalAmount,
        item.deliveryCity,
        item.createdAtUtc
      ].join('|')
    );
  }

  private buildReviewSignatures(items: Review[]): string[] {
    return items.map(item =>
      [item.id, item.status, item.rating, item.comment, item.createdAtUtc].join('|')
    );
  }

  private findChatListing(chat: ChatSummary): ListingSummary | null {
    if (!chat.listingId) {
      return null;
    }

    return this.listings().find(listing => listing.id === chat.listingId) ?? null;
  }

  private findChatOrder(chat: ChatSummary): OrderSummary | null {
    if (!chat.listingId) {
      return null;
    }

    return (
      this.buyerOrders().find(order => order.listingId === chat.listingId) ??
      this.soldOrders().find(order => order.listingId === chat.listingId) ??
      null
    );
  }

  private messageDateKey(message: ChatMessage): string {
    return new Date(message.sentAtUtc).toDateString();
  }

  private findFirstUnreadIncomingMessageId(
    messages: ChatMessage[],
    unreadCountBeforeOpen: number
  ): string | null {
    if (unreadCountBeforeOpen <= 0) {
      return null;
    }

    const incomingMessages = messages.filter(message => !this.isOwnMessage(message));
    return incomingMessages.slice(-unreadCountBeforeOpen)[0]?.id ?? null;
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

    // The first frame renders the message list. A second frame accounts for
    // layout changes caused by message attachments and image dimensions.
    this.scrollMessagesFrame = window.requestAnimationFrame(() => {
      this.scrollMessagesFrame = null;
      if (this.shouldScrollMessagesToBottom) {
        viewport.scrollTop = viewport.scrollHeight;
        this.shouldScrollMessagesToBottom = false;
        this.scrollMessagesRetryCount = 0;
      }
    });
  }

  private sortChatsByLatest(items: ChatSummary[]): ChatSummary[] {
    return [...items].sort(
      (left, right) =>
        new Date(right.lastMessageAtUtc).getTime() - new Date(left.lastMessageAtUtc).getTime()
    );
  }

  private isProfileTab(value: string | null): value is ProfileTab {
    return this.tabs().some(tab => tab.key === value);
  }

  private attachmentExtension(message: ChatMessage): string | null {
    const attachmentUrl = this.attachmentUrl(message);
    if (!attachmentUrl) {
      return null;
    }

    const normalizedUrl = attachmentUrl.split('?')[0]?.split('#')[0] ?? '';
    const extension = normalizedUrl.split('.').pop()?.trim().toLowerCase();
    return extension || null;
  }

  private initializeRealtime(): void {
    if (this.realtimeConnected || !this.authService.isAuthenticated()) {
      return;
    }

    this.realtimeConnected = true;
    void this.chatRealtime.connect().catch(() => {
      this.realtimeConnected = false;
    });
  }

  private joinActiveChat(chatId: string): void {
    if (this.joinedChatId === chatId) {
      return;
    }

    const previousChatId = this.joinedChatId;
    this.joinedChatId = chatId;

    if (previousChatId) {
      void this.chatRealtime.leaveChat(previousChatId);
    }

    void this.chatRealtime.joinChat(chatId);
  }

  private playIncomingMessageSound(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return;
    }

    try {
      this.audioContext ??= new AudioContextCtor();
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.0001;

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      gainNode.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch {
      // Best-effort notification sound: ignore browser audio failures.
    }
  }
}
