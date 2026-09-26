import { CommonModule, CurrencyPipe } from '@angular/common';
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
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import {
  canBuyerCancel,
  formatPaymentMethod,
  formatShipmentStatus
} from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import { OrderDetails, ShipmentStatus } from '../../features/orders/order.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-order-track-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, SiteShellComponent],
  templateUrl: './order-track-page.html',
  styleUrl: './order-track-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTrackPageComponent {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderApi = inject(OrderApiService);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly orderId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly isSubmittingReview = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly order = signal<OrderDetails | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly isCancelDialogOpen = signal(false);
  protected readonly isReviewDialogOpen = signal(false);
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly canCancel = computed(() => {
    const currentOrder = this.order();
    return currentOrder ? canBuyerCancel(currentOrder.status) : false;
  });
  protected readonly hasExistingReview = computed(() => {
    const currentOrder = this.order();
    const currentUserId = this.authService.currentUser()?.id;
    if (!currentOrder || !currentUserId) {
      return false;
    }

    return this.reviews().some(
      review => review.orderId === currentOrder.id && review.authorId === currentUserId
    );
  });
  protected readonly canLeaveReview = computed(() => {
    const currentOrder = this.order();
    return !!currentOrder && currentOrder.status === 'Delivered' && !this.hasExistingReview();
  });

  protected readonly shipmentSteps: ShipmentStatus[] = ['Pending', 'ReadyToShip', 'InDelivery', 'Arrived'];

  constructor() {
    this.loadPage();
  }

  protected listingImageUrl(): string | null {
    return resolveApiUrl(this.order()?.listing.primaryImageUrl);
  }

  protected goBack(): void {
    void this.router.navigate(['/profile'], { queryParams: { tab: 'orders' } });
  }

  protected trackState(order: OrderDetails): 'pending' | 'in-delivery' | 'refusal' | 'arrived' | 'bought' {
    if (order.status === 'Declined' || order.status === 'Cancelled' || order.shipment?.status === 'Cancelled') {
      return 'refusal';
    }

    if (order.status === 'Delivered') {
      return 'bought';
    }

    if (order.shipment?.status === 'Arrived') {
      return 'arrived';
    }

    if (order.status === 'Shipped' || order.shipment?.status === 'InDelivery') {
      return 'in-delivery';
    }

    return 'pending';
  }

  protected trackStateLabel(order: OrderDetails): string {
    switch (this.trackState(order)) {
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

  protected paymentValue(order: OrderDetails): string {
    return order.paymentMethod === 'Card'
      ? order.paymentCardMasked || 'Saved card'
      : 'Payment upon delivery';
  }

  protected sellerName(order: OrderDetails): string {
    return order.shipment?.senderFirstName || order.seller.userName || '';
  }

  protected sellerSurname(order: OrderDetails): string {
    return order.shipment?.senderLastName || '';
  }

  protected sellerPhone(order: OrderDetails): string {
    return order.shipment?.senderPhone || order.seller.phone || '';
  }

  protected formatPaymentMethod(value: OrderDetails['paymentMethod']): string {
    return formatPaymentMethod(value);
  }

  protected formatShipmentStatus(value?: ShipmentStatus | null): string {
    return formatShipmentStatus(value);
  }

  protected isStepActive(step: ShipmentStatus): boolean {
    const currentStatus = this.order()?.shipment?.status ?? 'Pending';
    return this.shipmentSteps.indexOf(step) <= this.shipmentSteps.indexOf(currentStatus);
  }

  protected requestCancel(): void {
    this.isCancelDialogOpen.set(true);
  }

  protected closeCancelDialog(): void {
    this.isCancelDialogOpen.set(false);
  }

  protected openReviewDialog(): void {
    this.reviewRating.set(5);
    this.reviewComment.set('');
    this.isReviewDialogOpen.set(true);
  }

  protected closeReviewDialog(): void {
    this.isReviewDialogOpen.set(false);
    this.reviewRating.set(5);
    this.reviewComment.set('');
  }

  protected updateReviewRating(value: number): void {
    this.reviewRating.set(Number(value));
  }

  protected updateReviewComment(value: string): void {
    this.reviewComment.set(value);
  }

  protected submitReview(): void {
    const currentOrder = this.order();
    const comment = this.reviewComment().trim();
    if (!currentOrder || !comment) {
      return;
    }

    this.isSubmittingReview.set(true);
    this.reviewApi
      .createReview({
        orderId: currentOrder.id,
        targetUserId: currentOrder.seller.id,
        rating: this.reviewRating(),
        comment
      })
      .pipe(finalize(() => this.isSubmittingReview.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: review => {
          this.reviews.update(items => [review, ...items]);
          this.closeReviewDialog();
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to submit the review right now.'));
        }
      });
  }

  protected confirmCancel(): void {
    if (!this.orderId) {
      return;
    }

    this.isSubmitting.set(true);
    this.orderApi
      .cancelOrder(this.orderId)
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.order.set(order);
          this.isCancelDialogOpen.set(false);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to refuse this order right now.'));
        }
      });
  }

  private loadPage(): void {
    if (!this.orderId) {
      this.errorMessage.set('Order id is missing.');
      this.isLoading.set(false);
      return;
    }

    this.orderApi
      .getOrder(this.orderId)
      .pipe(
        switchMap(order =>
          forkJoin({
            order: of(order),
            reviews: this.reviewApi.getUserReviews(order.seller.id)
          })
        ),
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ order, reviews }) => {
          this.order.set(order);
          this.reviews.set(reviews);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load this order right now.'));
        }
      });
  }
}
