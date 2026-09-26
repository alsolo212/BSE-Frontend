import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { ChatApiService } from '../../features/chats/chat-api.service';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { CartApiService } from '../../features/cart/cart-api.service';
import { formatListingCondition, formatListingStatus } from '../../features/listings/listing.constants';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { ListingDetails, ListingImage, ListingSummary } from '../../features/listings/listing.models';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { PageTitleService } from '../../core/seo/page-title.service';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-listing-details-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule, SiteShellComponent],
  templateUrl: './listing-details-page.html',
  styleUrl: './listing-details-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListingDetailsPageComponent {
  private readonly authService = inject(AuthService);
  private readonly cartApi = inject(CartApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly listingApi = inject(ListingApiService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly listingId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly isDeleting = signal(false);
  protected readonly isReporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly listing = signal<ListingDetails | null>(null);
  protected readonly sellerProfile = signal<UserProfile | null>(null);
  protected readonly activeImageIndex = signal(0);
  protected readonly isPhoneDialogOpen = signal(false);
  protected readonly isCopied = signal(false);
  protected readonly isFullscreenGalleryOpen = signal(false);
  protected readonly isReportDialogOpen = signal(false);
  protected readonly reportReason = signal('');
  protected readonly similarProducts = signal<ListingSummary[]>([]);

  protected readonly isOwnerMode = computed(() => {
    const currentUserId = this.authService.currentUser()?.id;
    return !!currentUserId && currentUserId === this.listing()?.owner.id;
  });

  protected readonly canOwnerEdit = computed(() => {
    const currentListing = this.listing();
    const status = currentListing?.status;
    return !!currentListing && !currentListing.hasActiveOrders && (
      status === 'Published' ||
      status === 'Active' ||
      status === 'Draft'
    );
  });

  protected readonly visibleImages = computed(() => {
    return this.listing()?.images ?? [];
  });

  protected readonly activeImage = computed(() => {
    const images = this.visibleImages();
    if (images.length === 0) {
      return null;
    }

    const nextIndex = Math.min(this.activeImageIndex(), images.length - 1);
    return images[nextIndex] ?? null;
  });

  protected readonly sellerInitial = computed(() => {
    const sellerName = this.sellerProfile()?.userName?.trim();
    return sellerName ? sellerName.charAt(0).toUpperCase() : 'B';
  });

  protected readonly deliveryState = computed(() => {
    const currentListing = this.listing();
    if (!currentListing) {
      return 'Ready to ship';
    }

    return currentListing.quantity === 1 && ['ReadyToShip', 'InDelivery', 'Sold', 'Arrived'].includes(currentListing.status)
      ? 'Sent to buyer'
      : 'Ready to ship';
  });

  constructor() {
    this.loadPage();
  }

  protected goBack(): void {
    if (this.isOwnerMode()) {
      void this.router.navigateByUrl('/profile');
      return;
    }

    void this.router.navigateByUrl('/');
  }

  protected selectImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  protected showPreviousImage(): void {
    const images = this.visibleImages();
    if (images.length === 0) {
      return;
    }

    this.activeImageIndex.update(index => (index === 0 ? images.length - 1 : index - 1));
  }

  protected showNextImage(): void {
    const images = this.visibleImages();
    if (images.length === 0) {
      return;
    }

    this.activeImageIndex.update(index => (index === images.length - 1 ? 0 : index + 1));
  }

  protected openFullscreenGallery(): void {
    if (this.visibleImages().length === 0) {
      return;
    }

    this.isFullscreenGalleryOpen.set(true);
  }

  protected closeFullscreenGallery(): void {
    this.isFullscreenGalleryOpen.set(false);
  }

  protected imageUrl(image?: ListingImage | null): string | null {
    return resolveApiUrl(image?.url);
  }

  protected sellerAvatarUrl(): string | null {
    return resolveApiUrl(this.sellerProfile()?.profileImageUrl ?? this.listing()?.owner.profileImageUrl);
  }

  protected summaryImageUrl(product: ListingSummary): string | null {
    return resolveApiUrl(product.primaryImageUrl);
  }

  protected openEditMode(): void {
    const listing = this.listing();
    if (!listing || !this.canOwnerEdit()) {
      return;
    }

    void this.router.navigate(['/listings', listing.id, 'edit']);
  }

  protected requestDelete(): void {
    this.isDeleting.set(true);
  }

  protected closeDeleteDialog(): void {
    this.isDeleting.set(false);
  }

  protected confirmDelete(): void {
    const listing = this.listing();
    if (!listing) {
      return;
    }

    this.errorMessage.set(null);
    this.listingApi.deleteListing(listing.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        void this.router.navigateByUrl('/profile');
      },
      error: error => {
        this.isDeleting.set(false);
        this.errorMessage.set(
          extractApiError(error, 'Unable to delete the listing right now.')
        );
      }
    });
  }

  protected openPhoneDialog(): void {
    this.isPhoneDialogOpen.set(true);
    this.isCopied.set(false);
  }

  protected closePhoneDialog(): void {
    this.isPhoneDialogOpen.set(false);
    this.isCopied.set(false);
  }

  protected copyPhone(): void {
    const phone = this.sellerProfile()?.phone;
    if (!phone || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(phone);
    this.isCopied.set(true);
  }

  protected startChat(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/auth');
      return;
    }

    const listing = this.listing();
    if (!listing) {
      return;
    }

    this.chatApi.startChat({ listingId: listing.id }).subscribe({
      next: chat => {
        void this.router.navigate(['/profile'], {
          queryParams: { tab: 'chats', chatId: chat.id }
        });
      },
      error: error => {
        this.errorMessage.set(
          extractApiError(error, 'Unable to open the chat with this seller right now.')
        );
      }
    });
  }

  protected buyNow(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/auth');
      return;
    }

    const listing = this.listing();
    if (!listing) {
      return;
    }

    void this.router.navigate(['/checkout/listing', listing.id]);
  }

  protected addToCart(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/auth');
      return;
    }

    const listing = this.listing();
    if (!listing) {
      return;
    }

    this.cartApi.addToCart({ listingId: listing.id }).subscribe({
      next: () => {
        void this.router.navigateByUrl('/cart');
      },
      error: error => {
        this.errorMessage.set(
          extractApiError(error, 'Unable to add the listing to cart right now.')
        );
      }
    });
  }

  protected formatCondition(condition: ListingDetails['condition']): string {
    return formatListingCondition(condition);
  }

  protected formatStatus(status: ListingDetails['status']): string {
    return formatListingStatus(status);
  }

  protected openSellerProfile(): void {
    const sellerId = this.sellerProfile()?.id ?? this.listing()?.owner.id;
    if (!sellerId) {
      return;
    }

    void this.router.navigate(['/sellers', sellerId]);
  }

  protected openSimilarListing(productId: string): void {
    openRouteInNewTab(this.router, ['/listings', productId]);
  }

  protected productTitle(title: string): string {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length <= 44) {
      return normalizedTitle;
    }

    return `${normalizedTitle.slice(0, 41).trimEnd()}...`;
  }

  protected openReportDialog(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/auth');
      return;
    }

    this.reportReason.set('');
    this.isReportDialogOpen.set(true);
  }

  protected closeReportDialog(): void {
    this.isReportDialogOpen.set(false);
    this.reportReason.set('');
  }

  protected updateReportReason(value: string): void {
    this.reportReason.set(value);
  }

  protected submitReport(): void {
    const currentListing = this.listing();
    const reason = this.reportReason().trim();
    if (!currentListing || !reason) {
      return;
    }

    this.isReporting.set(true);
    this.listingApi
      .reportListing(currentListing.id, reason)
      .pipe(finalize(() => this.isReporting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeReportDialog();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to submit the report right now.'));
        }
      });
  }

  private loadPage(): void {
    if (!this.listingId) {
      this.errorMessage.set('Listing id is missing.');
      this.isLoading.set(false);
      return;
    }

    this.listingApi
      .getListing(this.listingId)
      .pipe(
        switchMap(listing =>
          forkJoin({
            listing: of(listing),
            seller: this.profileApi.getUserProfile(listing.owner.id),
            similar: this.listingApi.getListings({
              categoryId: listing.categoryId,
              status: 'Published'
            })
          })
        ),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: ({ listing, seller, similar }) => {
          this.listing.set(listing);
          this.pageTitle.setProductTitle(listing.title);
          this.sellerProfile.set(seller);
          this.similarProducts.set(similar.filter(product => product.id !== listing.id).slice(0, 8));
          this.activeImageIndex.set(0);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load the product details right now.')
          );
        }
      });
  }
}
