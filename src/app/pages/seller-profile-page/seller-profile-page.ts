import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
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
import {
  formatListingCondition,
  formatListingStatus,
  listingConditionFilterOptions,
  listingSortOptions
} from '../../features/listings/listing.constants';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { ListingCondition, ListingSummary } from '../../features/listings/listing.models';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type SellerTab = 'products' | 'reviews';
type ListingSort = (typeof listingSortOptions)[number]['value'];
type ListingConditionFilter = 'all' | ListingCondition;
type ListingCategoryFilter = 'all' | string;

@Component({
  selector: 'app-seller-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, SiteShellComponent],
  templateUrl: './seller-profile-page.html',
  styleUrl: './seller-profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SellerProfilePageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly listingApi = inject(ListingApiService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly sellerId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly seller = signal<UserProfile | null>(null);
  protected readonly listings = signal<ListingSummary[]>([]);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly activeTab = signal<SellerTab>('products');
  protected readonly searchTerm = signal('');
  protected readonly selectedSort = signal<ListingSort>('newest');
  protected readonly selectedCondition = signal<ListingConditionFilter>('all');
  protected readonly selectedCategory = signal<ListingCategoryFilter>('all');
  protected readonly minPrice = signal('');
  protected readonly maxPrice = signal('');
  protected readonly isFilterMenuOpen = signal(false);
  protected readonly isSortMenuOpen = signal(false);

  protected readonly sortOptions = listingSortOptions;
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

  protected readonly sellerInitial = computed(() => {
    const userName = this.seller()?.userName?.trim();
    return userName ? userName.charAt(0).toUpperCase() : 'B';
  });

  protected readonly reviewAverage = computed(() => {
    const reviews = this.reviews();
    if (reviews.length === 0) {
      return this.seller()?.averageRating ?? 0;
    }

    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    return Math.round(average * 100) / 100;
  });

  protected readonly roundedReviewAverage = computed(() => Math.round(this.reviewAverage()));

  protected readonly reviewAverageLabel = computed(() => {
    const average = this.reviewAverage();
    return `${Number.isInteger(average) ? average.toFixed(1) : average}/5`;
  });

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

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.activeTab.set(params.get('tab') === 'reviews' ? 'reviews' : 'products');
    });

    this.loadPage();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.profile-toolbar__dropdown-wrap')) {
      this.isSortMenuOpen.set(false);
      this.isFilterMenuOpen.set(false);
    }
  }

  protected setActiveTab(tab: SellerTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'products' ? null : tab },
      queryParamsHandling: 'merge'
    });
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected applySearch(): void {
    this.searchTerm.set(this.searchTerm().trim());
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

  protected toggleSortMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isSortMenuOpen.update(value => !value);
    this.isFilterMenuOpen.set(false);
  }

  protected toggleFilterMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isFilterMenuOpen.update(value => !value);
    this.isSortMenuOpen.set(false);
  }

  protected sellerAvatarUrl(): string | null {
    return resolveApiUrl(this.seller()?.profileImageUrl);
  }

  protected listingImageUrl(listing: ListingSummary): string | null {
    return resolveApiUrl(listing.primaryImageUrl);
  }

  protected openListing(listingId: string): void {
    openRouteInNewTab(this.router, ['/listings', listingId]);
  }

  protected formatCondition(condition: ListingCondition): string {
    return formatListingCondition(condition);
  }

  protected formatStatus(status: ListingSummary['status']): string {
    return formatListingStatus(status);
  }

  protected ratingLabel(rating: number): string {
    return `${rating}/5`;
  }

  protected reviewStars(): number[] {
    return [1, 2, 3, 4, 5];
  }

  protected reviewStatusLabel(status: Review['status']): string {
    switch (status) {
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

  private loadPage(): void {
    if (!this.sellerId) {
      this.errorMessage.set('Seller id is missing.');
      this.isLoading.set(false);
      return;
    }

    forkJoin({
      seller: this.profileApi.getUserProfile(this.sellerId),
      listings: this.listingApi.getListings({
        ownerId: this.sellerId
      }),
      reviews: this.reviewApi.getUserReviews(this.sellerId)
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ seller, listings, reviews }) => {
          this.seller.set(seller);
          this.listings.set(listings);
          this.reviews.set(reviews);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load the seller profile right now.')
          );
        }
      });
  }
}
