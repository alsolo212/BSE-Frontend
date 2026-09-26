import { CommonModule, CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { formatPaymentMethod } from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import { OrderDetails } from '../../features/orders/order.models';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

interface SavedSellerDetails {
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  payoutCardMasked: string;
}

@Component({
  selector: 'app-shipment-confirmation-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, SiteShellComponent],
  templateUrl: './shipment-confirmation-page.html',
  styleUrl: './shipment-confirmation-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShipmentConfirmationPageComponent {
  private readonly savedSellerStoragePrefix = 'bse.shipment.saved-seller';
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly orderApi = inject(OrderApiService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly orderId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly order = signal<OrderDetails | null>(null);
  protected readonly sellerProfile = signal<UserProfile | null>(null);
  protected readonly savedSellerDetails = signal<SavedSellerDetails | null>(null);
  protected readonly isRefuseDialogOpen = signal(false);

  protected readonly form = this.formBuilder.group({
    recipientName: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(240)]],
    deliveryAddress: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(500)]],
    senderFirstName: ['', [Validators.required, Validators.maxLength(120)]],
    senderLastName: ['', [Validators.required, Validators.maxLength(120)]],
    senderPhone: ['', [Validators.required, Validators.maxLength(32)]],
    payoutCardMasked: ['', [Validators.required, Validators.maxLength(128)]],
    saveSellerDetails: [false]
  });

  constructor() {
    this.loadPage();
  }

  protected formatPaymentMethod(value: OrderDetails['paymentMethod']): string {
    return formatPaymentMethod(value);
  }

  protected listingImageUrl(): string | null {
    return resolveApiUrl(this.order()?.listing.primaryImageUrl);
  }

  protected goBack(): void {
    void this.router.navigate(['/profile'], { queryParams: { tab: 'sold' } });
  }

  protected requestRefuse(): void {
    this.isRefuseDialogOpen.set(true);
  }

  protected closeRefuseDialog(): void {
    this.isRefuseDialogOpen.set(false);
  }

  protected confirmShipment(): void {
    if (!this.orderId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.orderApi
      .updateShipment(this.orderId, {
        status: 'ReadyToShip',
        senderFirstName: rawValue.senderFirstName.trim(),
        senderLastName: rawValue.senderLastName.trim(),
        senderPhone: rawValue.senderPhone.trim(),
        payoutCardMasked: rawValue.payoutCardMasked.trim()
      })
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedOrder => {
          this.persistSavedSellerDetails(rawValue);
          void this.router.navigate(['/orders', updatedOrder.id, 'seller-track']);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to confirm the shipment right now.')
          );
        }
      });
  }

  protected confirmRefuse(): void {
    if (!this.orderId) {
      return;
    }

    this.isSubmitting.set(true);
    this.orderApi
      .setSellerDecision(this.orderId, false)
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isRefuseDialogOpen.set(false);
          void this.router.navigate(['/profile'], { queryParams: { tab: 'sold' } });
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to refuse the order right now.'));
        }
      });
  }

  protected controlHasError(
    controlName:
      | 'recipientName'
      | 'deliveryAddress'
      | 'senderFirstName'
      | 'senderLastName'
      | 'senderPhone'
      | 'payoutCardMasked'
  ): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  private loadPage(): void {
    if (!this.orderId) {
      this.errorMessage.set('Order id is missing.');
      this.isLoading.set(false);
      return;
    }

    forkJoin({
      order: this.orderApi.getOrder(this.orderId),
      sellerProfile: this.profileApi.getMyProfile()
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ order, sellerProfile }) => {
          this.order.set(order);
          this.sellerProfile.set(sellerProfile);
          const savedSellerDetails = this.readSavedSellerDetails(sellerProfile.id);
          this.savedSellerDetails.set(savedSellerDetails);
          const shipmentFirstName =
            order.shipment?.senderLastName ||
            order.shipment?.senderFirstName !== sellerProfile.userName
              ? order.shipment?.senderFirstName
              : '';
          this.form.patchValue({
            recipientName: `${order.buyerFirstName} ${order.buyerLastName}`.trim(),
            deliveryAddress: order.deliveryAddress,
            senderFirstName: savedSellerDetails?.senderFirstName ?? shipmentFirstName ?? '',
            senderLastName: savedSellerDetails?.senderLastName ?? order.shipment?.senderLastName ?? '',
            senderPhone: savedSellerDetails?.senderPhone ?? order.shipment?.senderPhone ?? sellerProfile.phone ?? '',
            payoutCardMasked: savedSellerDetails?.payoutCardMasked ?? order.shipment?.payoutCardMasked ?? '',
            saveSellerDetails: !!savedSellerDetails
          });
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load shipment confirmation right now.')
          );
        }
      });
  }

  private persistSavedSellerDetails(rawValue: ReturnType<typeof this.form.getRawValue>): void {
    const sellerProfile = this.sellerProfile();
    if (!sellerProfile) {
      return;
    }

    if (rawValue.saveSellerDetails) {
      const details: SavedSellerDetails = {
        senderFirstName: rawValue.senderFirstName.trim(),
        senderLastName: rawValue.senderLastName.trim(),
        senderPhone: rawValue.senderPhone.trim(),
        payoutCardMasked: rawValue.payoutCardMasked.trim()
      };

      this.writeSavedSellerDetails(sellerProfile.id, details);
      return;
    }

    this.clearSavedSellerDetails(sellerProfile.id);
  }

  private readSavedSellerDetails(userId: string): SavedSellerDetails | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const rawValue = window.localStorage.getItem(this.buildSavedSellerStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as SavedSellerDetails;
      if (
        !parsed.senderFirstName &&
        !parsed.senderLastName &&
        !parsed.senderPhone &&
        !parsed.payoutCardMasked
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private writeSavedSellerDetails(userId: string, details: SavedSellerDetails): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.buildSavedSellerStorageKey(userId), JSON.stringify(details));
    this.savedSellerDetails.set(details);
  }

  private clearSavedSellerDetails(userId: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(this.buildSavedSellerStorageKey(userId));
    this.savedSellerDetails.set(null);
  }

  private buildSavedSellerStorageKey(userId: string): string {
    return `${this.savedSellerStoragePrefix}.${userId}`;
  }
}
