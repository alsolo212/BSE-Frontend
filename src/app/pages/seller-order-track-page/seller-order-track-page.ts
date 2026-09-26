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
import { formatShipmentStatus } from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import { OrderDetails, ShipmentStatus } from '../../features/orders/order.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-seller-order-track-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, SiteShellComponent],
  templateUrl: './seller-order-track-page.html',
  styleUrl: './seller-order-track-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SellerOrderTrackPageComponent {
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
  protected readonly isReviewDialogOpen = signal(false);
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly shipmentSteps: ShipmentStatus[] = ['Pending', 'ReadyToShip', 'InDelivery', 'Arrived'];
  protected readonly trackStates = ['ordered', 'awaiting-shipment', 'in-delivery', 'sold'] as const;
  protected readonly canMarkInDelivery = computed(
    () => this.order()?.shipment?.status === 'ReadyToShip'
  );
  protected readonly canMarkArrived = computed(
    () => this.order()?.shipment?.status === 'InDelivery'
  );
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

  constructor() {
    this.loadPage();
  }

  protected listingImageUrl(): string | null {
    return resolveApiUrl(this.order()?.listing.primaryImageUrl);
  }

  protected goBack(): void {
    void this.router.navigate(['/profile'], { queryParams: { tab: 'sold' } });
  }

  protected trackState(order: OrderDetails): 'ordered' | 'awaiting-shipment' | 'in-delivery' | 'refusal' | 'sold' {
    if (order.status === 'Declined' || order.status === 'Cancelled' || order.shipment?.status === 'Cancelled') {
      return 'refusal';
    }

    if (order.status === 'Delivered' || order.shipment?.status === 'Arrived') {
      return 'sold';
    }

    if (order.status === 'Shipped' || order.shipment?.status === 'InDelivery') {
      return 'in-delivery';
    }

    if (order.status === 'Accepted' || order.shipment?.status === 'ReadyToShip') {
      return 'awaiting-shipment';
    }

    return 'ordered';
  }

  protected trackStateLabel(order: OrderDetails): string {
    switch (this.trackState(order)) {
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

  protected advanceTrackStatus(): void {
    const currentOrder = this.order();
    if (!currentOrder || this.isSubmitting()) {
      return;
    }

    const state = this.trackState(currentOrder);
    if (state === 'ordered') {
      this.isSubmitting.set(true);
      this.orderApi
        .setSellerDecision(currentOrder.id, true)
        .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: order => this.order.set(order),
          error: error => {
            this.errorMessage.set(extractApiError(error, 'Unable to accept this order right now.'));
          }
        });
      return;
    }

    if (state === 'awaiting-shipment') {
      this.updateShipmentStatus('InDelivery');
      return;
    }

    if (state === 'in-delivery') {
      this.updateShipmentStatus('Arrived');
    }
  }

  protected formatShipmentStatus(value?: ShipmentStatus | null): string {
    return formatShipmentStatus(value);
  }

  protected isStepActive(step: ShipmentStatus): boolean {
    const currentStatus = this.order()?.shipment?.status ?? 'Pending';
    return this.shipmentSteps.indexOf(step) <= this.shipmentSteps.indexOf(currentStatus);
  }

  protected markInDelivery(): void {
    this.updateShipmentStatus('InDelivery');
  }

  protected markArrived(): void {
    this.updateShipmentStatus('Arrived');
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
        targetUserId: currentOrder.buyer.id,
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
            reviews: this.reviewApi.getUserReviews(order.buyer.id)
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
          this.errorMessage.set(
            extractApiError(error, 'Unable to load seller shipment details right now.')
          );
        }
      });
  }

  private updateShipmentStatus(status: ShipmentStatus): void {
    const currentOrder = this.order();
    if (!currentOrder || !currentOrder.shipment) {
      return;
    }

    this.isSubmitting.set(true);
    this.orderApi
      .updateShipment(currentOrder.id, {
        status,
        senderFirstName: currentOrder.shipment.senderFirstName,
        senderLastName: currentOrder.shipment.senderLastName,
        senderPhone: currentOrder.shipment.senderPhone,
        payoutCardMasked: currentOrder.shipment.payoutCardMasked
      })
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.order.set(order);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to update shipment status right now.')
          );
        }
      });
  }
}
