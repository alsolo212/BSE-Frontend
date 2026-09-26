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
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { CatalogApiService } from '../../features/catalog/catalog-api.service';
import { CatalogCategory, CatalogProduct } from '../../features/catalog/catalog.models';
import { listingConditionFilterOptions } from '../../features/listings/listing.constants';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type ProductSort = 'recommended' | 'newest' | 'cheapest' | 'expensive';
type ProductConditionFilter = 'all' | 'New' | 'Used';
type ViewMode = 'list' | 'grid';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, SiteShellComponent],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogPageComponent {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly categories = signal<CatalogCategory[]>([]);
  protected readonly products = signal<CatalogProduct[]>([]);
  protected readonly searchDraft = signal('');
  protected readonly selectedCategoryId = signal('all');
  protected readonly selectedCondition = signal<ProductConditionFilter>('all');
  protected readonly selectedSort = signal<ProductSort>('recommended');
  protected readonly minPrice = signal('');
  protected readonly maxPrice = signal('');
  protected readonly isSortOpen = signal(false);
  protected readonly isFilterOpen = signal(false);
  protected readonly viewMode = signal<ViewMode>('list');

  protected readonly conditionOptions = listingConditionFilterOptions;
  protected readonly sortOptions: Array<{ value: ProductSort; label: string }> = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'newest', label: 'Newest' },
    { value: 'cheapest', label: 'Cheapest' },
    { value: 'expensive', label: 'Most Expensive' }
  ];

  protected readonly resultsCount = computed(() => this.products().length);
  protected readonly resultsLabel = computed(() => {
    const count = this.resultsCount();
    return `${count} product${count === 1 ? '' : 's'} found`;
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.searchDraft.set(params.get('searchTerm') ?? '');
      this.selectedCategoryId.set(params.get('categoryId') ?? 'all');
      this.selectedCondition.set((params.get('condition') as ProductConditionFilter | null) ?? 'all');
      this.selectedSort.set((params.get('sortBy') as ProductSort | null) ?? 'recommended');
      this.minPrice.set(params.get('minPrice') ?? '');
      this.maxPrice.set(params.get('maxPrice') ?? '');
      this.viewMode.set(params.get('view') === 'grid' ? 'grid' : 'list');
      this.loadProducts();
    });

    this.loadCategories();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.catalog-toolbar__dropdown-wrap')) {
      this.isSortOpen.set(false);
      this.isFilterOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    this.isSortOpen.set(false);
    this.isFilterOpen.set(false);
  }

  protected updateSearchDraft(value: string): void {
    this.searchDraft.set(value);
  }

  protected applySearch(): void {
    this.updateQueryParams({ searchTerm: this.searchDraft().trim() || null });
  }

  protected updateCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
  }

  protected updateCondition(condition: ProductConditionFilter): void {
    this.selectedCondition.set(condition);
  }

  protected updateSort(sortBy: ProductSort): void {
    this.selectedSort.set(sortBy);
  }

  protected updateMinPrice(value: string | number): void {
    this.minPrice.set(String(value ?? ''));
  }

  protected updateMaxPrice(value: string | number): void {
    this.maxPrice.set(String(value ?? ''));
  }

  protected applySort(): void {
    this.updateQueryParams({ sortBy: this.selectedSort() === 'recommended' ? null : this.selectedSort() });
    this.isSortOpen.set(false);
  }

  protected resetSort(): void {
    this.selectedSort.set('recommended');
    this.updateQueryParams({ sortBy: null });
    this.isSortOpen.set(false);
  }

  protected applyFilters(): void {
    this.updateQueryParams({
      categoryId: this.selectedCategoryId() === 'all' ? null : this.selectedCategoryId(),
      condition: this.selectedCondition() === 'all' ? null : this.selectedCondition(),
      minPrice: this.minPrice().trim() || null,
      maxPrice: this.maxPrice().trim() || null
    });
    this.isFilterOpen.set(false);
  }

  protected resetFilters(): void {
    this.selectedCategoryId.set('all');
    this.selectedCondition.set('all');
    this.minPrice.set('');
    this.maxPrice.set('');
    this.updateQueryParams({
      categoryId: null,
      condition: null,
      minPrice: null,
      maxPrice: null
    });
    this.isFilterOpen.set(false);
  }

  protected toggleSortMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isSortOpen.update(value => !value);
    this.isFilterOpen.set(false);
  }

  protected toggleFilterMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isFilterOpen.update(value => !value);
    this.isSortOpen.set(false);
  }

  protected setViewMode(viewMode: ViewMode): void {
    this.viewMode.set(viewMode);
    this.updateQueryParams({ view: viewMode === 'list' ? null : viewMode });
  }

  protected openListing(productId: string): void {
    openRouteInNewTab(this.router, ['/listings', productId]);
  }

  protected productImageUrl(product: CatalogProduct): string | null {
    return resolveApiUrl(product.primaryImageUrl);
  }

  protected productTitle(title: string): string {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length <= 44) {
      return normalizedTitle;
    }

    return `${normalizedTitle.slice(0, 41).trimEnd()}...`;
  }

  private loadCategories(): void {
    this.catalogApi
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: categories => {
          this.categories.set([{ id: 'all', name: 'All Categories' }, ...categories]);
        },
        error: () => {
          this.errorMessage.set('Unable to load category filters right now.');
        }
      });
  }

  private loadProducts(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const sortBy =
      this.selectedSort() === 'recommended'
        ? undefined
        : (this.selectedSort() as 'newest' | 'cheapest' | 'expensive');

    this.catalogApi
      .getProducts({
        searchTerm: this.searchDraft().trim() || undefined,
        categoryId: this.selectedCategoryId() === 'all' ? undefined : this.selectedCategoryId(),
        condition:
          this.selectedCondition() === 'all'
            ? undefined
            : (this.selectedCondition() as 'New' | 'Used'),
        sortBy
      })
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: products => {
          const minPrice = Number(this.minPrice());
          const maxPrice = Number(this.maxPrice());

          this.products.set(
            products.filter(product => {
              const matchesMin = !this.minPrice().trim() || product.price >= minPrice;
              const matchesMax = !this.maxPrice().trim() || product.price <= maxPrice;
              return matchesMin && matchesMax;
            })
          );
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load products right now.'));
          this.products.set([]);
        }
      });
  }

  private updateQueryParams(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
  }
}
