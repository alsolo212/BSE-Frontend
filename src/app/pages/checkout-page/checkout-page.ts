import { CommonModule, CurrencyPipe } from '@angular/common';
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
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { CartApiService } from '../../features/cart/cart-api.service';
import { CartItem } from '../../features/cart/cart.models';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { ListingDetails } from '../../features/listings/listing.models';
import {
  formatPaymentMethod,
  paymentMethodOptions
} from '../../features/orders/order.constants';
import { OrderApiService } from '../../features/orders/order-api.service';
import {
  CheckoutCartRequest,
  CreateOrderRequest,
  PaymentMethod
} from '../../features/orders/order.models';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type CheckoutMode = 'listing' | 'cart';

interface SavedBuyerDetails {
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryCity?: string;
}

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyPipe, SiteShellComponent],
  templateUrl: './checkout-page.html',
  styleUrl: './checkout-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckoutPageComponent {
  private readonly savedBuyerStoragePrefix = 'bse.checkout.saved-buyer';
  private readonly cartApi = inject(CartApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly listingApi = inject(ListingApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly mode = (this.route.snapshot.data['mode'] ?? 'listing') as CheckoutMode;
  private readonly listingId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cardErrorMessage = signal<string | null>(null);
  protected readonly isStripeLoading = signal(false);
  protected readonly listing = signal<ListingDetails | null>(null);
  protected readonly cartItems = signal<CartItem[]>([]);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly savedBuyerDetails = signal<SavedBuyerDetails | null>(null);
  protected readonly selectedPaymentMethod = signal<PaymentMethod>('CashOnDelivery');
  protected readonly paymentOptions = paymentMethodOptions;
  protected readonly isCartMode = computed(() => this.mode === 'cart');
  protected readonly isCardPayment = computed(() => this.selectedPaymentMethod() === 'Card');
  protected readonly selectedCartItems = computed(() =>
    this.cartItems().filter(item => item.isSelected)
  );
  protected readonly selectedCount = computed(() => this.selectedCartItems().length);
  protected readonly pageTitle = computed(() => 'Buy');
  protected readonly totalAmount = computed(() => {
    if (this.isCartMode()) {
      return this.selectedCartItems().reduce((sum, item) => sum + item.listing.price * item.quantity, 0);
    }

    return (this.listing()?.price ?? 0) * this.form.controls.quantity.getRawValue();
  });

  private stripe: Stripe | null = null;
  private stripeCardElement: StripeCardElement | null = null;
  private stripePublishableKey: string | null = null;
  private cardElementContainer: ElementRef<HTMLElement> | null = null;

  @ViewChild('cardElementContainer')
  private set cardElementContainerRef(value: ElementRef<HTMLElement> | undefined) {
    this.cardElementContainer = value ?? null;
    this.mountCardElement();
  }

  protected readonly form = this.formBuilder.group({
    paymentMethod: ['CashOnDelivery' as PaymentMethod, [Validators.required]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    saveCard: [false],
    saveBuyerDetails: [false],
    buyerFirstName: ['', [Validators.required, Validators.maxLength(120)]],
    buyerLastName: ['', [Validators.required, Validators.maxLength(120)]],
    buyerEmail: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    buyerPhone: ['', [Validators.required, Validators.maxLength(32)]],
    deliveryAddress: ['', [Validators.required, Validators.maxLength(512)]],
    deliveryCity: ['']
  });

  constructor() {
    this.selectedPaymentMethod.set(this.form.controls.paymentMethod.getRawValue());
    this.form.controls.paymentMethod.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(method => {
        this.selectedPaymentMethod.set(method);
        if (method === 'Card') {
          void this.initializeStripeCardElement();
        } else {
          this.unmountCardElement();
        }
      });

    this.loadPage();
  }

  protected get paymentMethodLabel(): string {
    return formatPaymentMethod(this.form.controls.paymentMethod.getRawValue());
  }

  protected availableQuantity(): number {
    return this.listing()?.quantity ?? 1;
  }

  protected directQuantityOptions(): number[] {
    return Array.from({ length: Math.max(this.availableQuantity(), 1) }, (_, index) => index + 1);
  }

  protected listingImageUrl(): string | null {
    return resolveApiUrl(this.listing()?.images[0]?.url);
  }

  protected cartItemImageUrl(item: CartItem): string | null {
    return resolveApiUrl(item.listing.primaryImageUrl);
  }

  protected availableCartQuantities(item: CartItem): number[] {
    return Array.from({ length: Math.max(item.listing.availableQuantity, 1) }, (_, index) => index + 1);
  }

  protected updateCartQuantity(itemId: string, quantity: number): void {
    this.isSubmitting.set(true);
    this.cartApi
      .updateItem(itemId, { isSelected: true, quantity })
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.cartItems.set(response.items);
          this.errorMessage.set(null);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update quantity right now.'));
        }
      });
  }

  protected updateCheckoutCartQuantity(item: CartItem, value: string): void {
    this.updateCartQuantity(item.id, Number(value));
  }

  protected updateDirectQuantity(value: string): void {
    const nextQuantity = Math.max(1, Math.min(Number(value), this.availableQuantity()));
    this.form.controls.quantity.setValue(nextQuantity);
  }

  protected removeCheckoutCartItem(item: CartItem): void {
    this.isSubmitting.set(true);
    this.cartApi
      .updateItem(item.id, { isSelected: false, quantity: item.quantity })
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.cartItems.set(response.items);
          this.errorMessage.set(
            response.items.some(cartItem => cartItem.isSelected)
              ? null
              : 'Select at least one cart item before checkout.'
          );
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update this checkout item.'));
        }
      });
  }

  protected removeDirectListingFromCheckout(): void {
    this.goBack();
  }

  protected goBack(): void {
    if (this.isCartMode()) {
      void this.router.navigateByUrl('/cart');
      return;
    }

    if (this.listingId) {
      void this.router.navigate(['/listings', this.listingId]);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isCartMode() && this.selectedCartItems().length === 0) {
      this.errorMessage.set('Select at least one listing in the cart before checkout.');
      return;
    }

    if (!this.isCartMode() && !this.listingId) {
      this.errorMessage.set('Listing id is missing for checkout.');
      return;
    }

    const rawValue = this.form.getRawValue();
    if (!this.isCartMode() && rawValue.quantity > this.availableQuantity()) {
      this.errorMessage.set('The requested quantity is no longer available.');
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    const requestBase = {
      paymentMethod: rawValue.paymentMethod,
      buyerFirstName: rawValue.buyerFirstName.trim(),
      buyerLastName: rawValue.buyerLastName.trim(),
      buyerEmail: rawValue.buyerEmail.trim(),
      buyerPhone: rawValue.buyerPhone.trim(),
      deliveryAddress: rawValue.deliveryAddress.trim(),
      deliveryCity: (
        rawValue.deliveryCity.trim() ||
        this.savedBuyerDetails()?.deliveryCity?.trim() ||
        rawValue.deliveryAddress.trim()
      )
    };

    this.persistSavedBuyerPreference(rawValue);

    if (rawValue.paymentMethod === 'Card') {
      const request = this.isCartMode()
        ? {
            ...requestBase,
            cartItemIds: this.selectedCartItems().map(item => item.id),
            saveCard: rawValue.saveCard
          }
        : {
            ...requestBase,
            listingId: this.listingId!,
            quantity: rawValue.quantity,
            saveCard: rawValue.saveCard
          };

      await this.submitCardPayment(request);
      return;
    }

    if (this.isCartMode()) {
      this.orderApi
        .checkoutCart({
          ...requestBase,
          cartItemIds: this.selectedCartItems().map(item => item.id)
        } satisfies CheckoutCartRequest)
        .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.persistSavedBuyerPreference(rawValue);
            void this.router.navigate(['/profile'], { queryParams: { tab: 'orders' } });
          },
          error: error => {
            this.errorMessage.set(
              extractApiError(error, 'Unable to complete checkout right now.')
            );
          }
        });
      return;
    }

    this.orderApi
      .createOrder({
        ...requestBase,
        quantity: rawValue.quantity,
        listingId: this.listingId!
      } satisfies CreateOrderRequest)
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.persistSavedBuyerPreference(rawValue);
          void this.router.navigate(['/orders', order.id, 'track']);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to complete checkout right now.'));
        }
      });
  }

  private async submitCardPayment(
    request: Parameters<OrderApiService['createPaymentIntent']>[0]
  ): Promise<void> {
    if (!this.stripe || !this.stripeCardElement) {
      this.errorMessage.set('The secure card field is still loading. Please try again.');
      this.isSubmitting.set(false);
      await this.initializeStripeCardElement();
      return;
    }

    try {
      const response = await firstValueFrom(this.orderApi.createPaymentIntent(request));
      const result = await this.stripe.confirmCardPayment(response.clientSecret, {
        payment_method: {
          card: this.stripeCardElement,
          billing_details: {
            name: `${request.buyerFirstName} ${request.buyerLastName}`.trim(),
            email: request.buyerEmail
          }
        }
      });

      if (result.error) {
        this.cardErrorMessage.set(result.error.message ?? 'The card payment could not be completed.');
        return;
      }

      if (result.paymentIntent?.status !== 'succeeded') {
        this.errorMessage.set('The payment is still processing. Please check your orders shortly.');
        return;
      }

      this.persistSavedBuyerPreference(this.form.getRawValue());
      await this.router.navigate(['/profile'], { queryParams: { tab: 'orders', payment: 'success' } });
    } catch (error) {
      this.errorMessage.set(extractApiError(error, 'Unable to complete card payment right now.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async initializeStripeCardElement(): Promise<void> {
    if (this.stripeCardElement || this.isStripeLoading()) {
      this.mountCardElement();
      return;
    }

    this.isStripeLoading.set(true);
    try {
      if (!this.stripePublishableKey) {
        const config = await firstValueFrom(this.orderApi.getStripeConfig());
        this.stripePublishableKey = config.publishableKey;
      }

      this.stripe = await loadStripe(this.stripePublishableKey);
      if (!this.stripe) {
        throw new Error('Stripe.js could not be initialized.');
      }

      this.mountCardElement();
    } catch (error) {
      this.errorMessage.set(extractApiError(error, 'Unable to load the secure card form right now.'));
    } finally {
      this.isStripeLoading.set(false);
    }
  }

  private mountCardElement(): void {
    if (
      !this.stripe ||
      !this.cardElementContainer ||
      this.stripeCardElement ||
      this.selectedPaymentMethod() !== 'Card'
    ) {
      return;
    }

    this.stripeCardElement = this.stripe.elements().create('card', {
      hidePostalCode: true,
      style: {
        base: {
          color: '#1f2933',
          fontFamily: 'inherit',
          fontSize: '16px',
          '::placeholder': {
            color: '#7b8794'
          }
        },
        invalid: {
          color: '#d64545'
        }
      }
    });
    this.stripeCardElement.on('change', event => {
      this.cardErrorMessage.set(event.error?.message ?? null);
    });
    this.stripeCardElement.mount(this.cardElementContainer.nativeElement);
  }

  private unmountCardElement(): void {
    this.cardErrorMessage.set(null);
    this.stripeCardElement?.unmount();
    this.stripeCardElement = null;
  }

  protected controlHasError(
    controlName:
      | 'buyerFirstName'
      | 'buyerLastName'
      | 'buyerEmail'
      | 'buyerPhone'
      | 'deliveryAddress'
      | 'quantity'
  ): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  private loadPage(): void {
    const data$ = this.isCartMode()
      ? forkJoin({
          profile: this.profileApi.getMyProfile(),
          cart: this.cartApi.getCart(),
          listing: of<ListingDetails | null>(null)
        })
      : forkJoin({
          profile: this.profileApi.getMyProfile(),
          cart: of({ items: [], selectedTotalAmount: 0 }),
          listing: this.listingId ? this.listingApi.getListing(this.listingId) : of<ListingDetails | null>(null)
        });

    data$
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ profile, cart, listing }) => {
          this.profile.set(profile);
          this.cartItems.set(cart.items);
          this.listing.set(listing);
          const savedBuyerDetails = this.readSavedBuyerDetails(profile.id);
          this.savedBuyerDetails.set(savedBuyerDetails);
          this.form.patchValue({
            paymentMethod: 'CashOnDelivery',
            saveCard: false,
            saveBuyerDetails: !!savedBuyerDetails,
            buyerFirstName: savedBuyerDetails?.buyerFirstName ?? '',
            buyerLastName: savedBuyerDetails?.buyerLastName ?? '',
            buyerEmail: savedBuyerDetails?.buyerEmail ?? profile.email,
            buyerPhone: savedBuyerDetails?.buyerPhone ?? profile.phone ?? '',
            deliveryAddress: savedBuyerDetails?.deliveryAddress ?? '',
            deliveryCity: savedBuyerDetails?.deliveryCity ?? ''
          });
          this.selectedPaymentMethod.set('CashOnDelivery');

          if (listing) {
            this.form.patchValue({
              quantity: 1
            });
          }

          if (this.isCartMode() && cart.items.every(item => !item.isSelected)) {
            this.errorMessage.set('Select at least one cart item before checkout.');
          }
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load checkout right now.'));
        }
      });
  }

  private persistSavedBuyerPreference(rawValue: ReturnType<typeof this.form.getRawValue>): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    if (rawValue.saveBuyerDetails) {
      const details: SavedBuyerDetails = {
        buyerFirstName: rawValue.buyerFirstName.trim(),
        buyerLastName: rawValue.buyerLastName.trim(),
        buyerEmail: rawValue.buyerEmail.trim(),
        buyerPhone: rawValue.buyerPhone.trim(),
        deliveryAddress: rawValue.deliveryAddress.trim(),
        deliveryCity: rawValue.deliveryCity.trim() || rawValue.deliveryAddress.trim()
      };

      this.writeSavedBuyerDetails(profile.id, details);
      return;
    }

    this.clearSavedBuyerDetails(profile.id);
  }

  private readSavedBuyerDetails(userId: string): SavedBuyerDetails | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const rawValue = window.localStorage.getItem(this.buildSavedBuyerStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as SavedBuyerDetails;
      if (
        !parsed.buyerFirstName &&
        !parsed.buyerLastName &&
        !parsed.buyerEmail &&
        !parsed.buyerPhone &&
        !parsed.deliveryAddress
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private writeSavedBuyerDetails(userId: string, details: SavedBuyerDetails): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.buildSavedBuyerStorageKey(userId), JSON.stringify(details));
    this.savedBuyerDetails.set(details);
  }

  private clearSavedBuyerDetails(userId: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(this.buildSavedBuyerStorageKey(userId));
    this.savedBuyerDetails.set(null);
  }

  private buildSavedBuyerStorageKey(userId: string): string {
    return `${this.savedBuyerStoragePrefix}.${userId}`;
  }
}
