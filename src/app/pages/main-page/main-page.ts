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
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { CatalogApiService } from '../../features/catalog/catalog-api.service';
import { CatalogCategory, CatalogProduct } from '../../features/catalog/catalog.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

const categoryImageMap: Record<string, string> = {
  Job: 'assets/categories/job.jpg',
  'Real estate': 'assets/categories/real_estate.jpg',
  Cars: 'assets/categories/cars.jpg',
  Electronics: 'assets/categories/electronics.jpg',
  Sport: 'assets/categories/sport.jpg',
  Clothes: 'assets/categories/clothes.jpg',
  'Spare Parts': 'assets/categories/spare_parts.jpg',
  Toys: 'assets/categories/toys.jpg',
  Pets: 'assets/categories/pets.jpg'
};

@Component({
  selector: 'app-main-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, SiteShellComponent],
  templateUrl: './main-page.html',
  styleUrl: './main-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainPageComponent {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly categories = signal<CatalogCategory[]>([]);
  protected readonly featuredProducts = signal<CatalogProduct[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly featuredCount = computed(() => this.featuredProducts().length);

  constructor() {
    this.loadPage();
  }

  protected openProducts(categoryId?: string): void {
    void this.router.navigate(['/products'], {
      queryParams: categoryId ? { categoryId } : {}
    });
  }

  protected openListing(productId: string): void {
    openRouteInNewTab(this.router, ['/listings', productId]);
  }

  protected categoryImageUrl(category: CatalogCategory): string {
    return categoryImageMap[category.name] ?? 'assets/images/empty-marketplace.png';
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

  private loadPage(): void {
    this.catalogApi
      .getHome()
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.categories.set(response.categories);
          this.featuredProducts.set(response.featuredListings);
        },
        error: () => {
          this.errorMessage.set('Unable to load the main marketplace page right now.');
        }
      });
  }
}
