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
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { CartApiService } from '../../features/cart/cart-api.service';
import { CartItem } from '../../features/cart/cart.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule, SiteShellComponent],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent {
  private readonly cartApi = inject(CartApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isUpdating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cartItems = signal<CartItem[]>([]);
  protected readonly selectedTotalAmount = signal(0);
  protected readonly hoveredRemoveItemId = signal<string | null>(null);

  protected readonly selectedItems = computed(() =>
    this.cartItems().filter(item => item.isSelected)
  );
  protected readonly selectedCount = computed(() => this.selectedItems().length);
  protected readonly computedTotalAmount = computed(() =>
    this.selectedItems().reduce((sum, item) => sum + item.listing.price * item.quantity, 0)
  );

  constructor() {
    this.loadCart();
  }

  protected itemImageUrl(item: CartItem): string | null {
    return resolveApiUrl(item.listing.primaryImageUrl);
  }

  protected toggleSelection(item: CartItem): void {
    this.updateItem(item.id, !item.isSelected, item.quantity);
  }

  protected availableQuantities(item: CartItem): number[] {
    return Array.from({ length: Math.max(item.listing.availableQuantity, 1) }, (_, index) => index + 1);
  }

  protected changeQuantity(item: CartItem, value: string): void {
    this.updateItem(item.id, item.isSelected, Number(value));
  }

  protected openListing(item: CartItem): void {
    openRouteInNewTab(this.router, ['/listings', item.listing.id]);
  }

  protected removeItem(item: CartItem): void {
    this.isUpdating.set(true);
    this.cartApi
      .removeItem(item.id)
      .pipe(finalize(() => this.isUpdating.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.patchCart(response.items, response.selectedTotalAmount);
          this.errorMessage.set(null);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to remove the cart item right now.'));
        }
      });
  }

  protected proceedToCheckout(): void {
    if (this.selectedCount() === 0) {
      this.errorMessage.set('Select at least one product before checkout.');
      return;
    }

    void this.router.navigateByUrl('/checkout/cart');
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  protected browseProducts(): void {
    void this.router.navigateByUrl('/products');
  }

  protected setHoveredRemoveItem(itemId: string | null): void {
    this.hoveredRemoveItemId.set(itemId);
  }

  protected removeIconUrl(itemId: string): string {
    return this.hoveredRemoveItemId() === itemId
      ? 'assets/icons/bin-danger-hover.svg'
      : 'assets/icons/bin-danger.svg';
  }

  private loadCart(): void {
    this.cartApi
      .getCart()
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.patchCart(response.items, response.selectedTotalAmount);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load the cart right now.'));
        }
      });
  }

  private updateItem(itemId: string, isSelected: boolean, quantity?: number): void {
    this.isUpdating.set(true);
    this.cartApi
      .updateItem(itemId, { isSelected, quantity })
      .pipe(finalize(() => this.isUpdating.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.patchCart(response.items, response.selectedTotalAmount);
          this.errorMessage.set(null);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update the cart right now.'));
        }
      });
  }

  private patchCart(items: CartItem[], selectedTotalAmount: number): void {
    this.cartItems.set(items);
    this.selectedTotalAmount.set(selectedTotalAmount);
  }
}
