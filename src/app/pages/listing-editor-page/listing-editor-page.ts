import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import {
  formatListingCondition,
  listingCityOptions,
  listingConditionOptions
} from '../../features/listings/listing.constants';
import { ListingApiService } from '../../features/listings/listing-api.service';
import { OrderApiService } from '../../features/orders/order-api.service';
import {
  ListingCategory,
  ListingCondition,
  ListingDetails,
  ListingImageUploadItem,
  ListingUpsertRequest
} from '../../features/listings/listing.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';
import { loadConnectAndInitialize, StripeConnectInstance } from '@stripe/connect-js';

type EditorMode = 'create' | 'edit';

interface ListingEditorImage {
  url: string;
  fileName: string;
  previewUrl: string;
}

@Component({
  selector: 'app-listing-editor-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SiteShellComponent],
  templateUrl: './listing-editor-page.html',
  styleUrl: './listing-editor-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ListingEditorPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly listingApi = inject(ListingApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly mode = (this.route.snapshot.data['mode'] ?? 'create') as EditorMode;
  private readonly listingId = this.route.snapshot.paramMap.get('id');

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly isUploadingImages = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isConnectLoading = signal(false);
  protected readonly isConnectReady = signal(false);
  protected readonly isDragging = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly categories = signal<ListingCategory[]>([]);
  protected readonly listing = signal<ListingDetails | null>(null);
  protected readonly images = signal<ListingEditorImage[]>([]);
  protected readonly draggedImageIndex = signal<number | null>(null);

  protected readonly conditionOptions = listingConditionOptions;
  protected readonly cityOptions = listingCityOptions;

  protected readonly isEditMode = computed(() => this.mode === 'edit');
  protected readonly pageTitle = computed(() => (this.isEditMode() ? 'Edit Product' : 'Create Product'));
  protected readonly pageSubtitle = computed(() =>
    this.isEditMode()
      ? 'Fill in the fields to edit the product.'
      : 'Fill in the fields to create a new product.'
  );
  protected readonly submitLabel = computed(() => (this.isEditMode() ? 'Edit' : 'Create'));
  protected readonly selectedImagesCount = computed(() => this.images().length);

  private connectInstance: StripeConnectInstance | null = null;
  private connectContainer: ElementRef<HTMLElement> | null = null;

  @ViewChild('connectContainer')
  private set connectContainerRef(value: ElementRef<HTMLElement> | undefined) {
    this.connectContainer = value ?? null;
    this.mountConnectOnboarding();
  }

  protected readonly form = this.formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.required, Validators.maxLength(4000)]],
    condition: ['' as ListingCondition | '', [Validators.required]],
    price: [null as number | null, [Validators.required, Validators.min(0.01)]],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    isNegotiable: [false],
    city: ['', [Validators.required, Validators.maxLength(120)]]
  });

  constructor() {
    this.loadPage();
  }

  protected goBack(): void {
    if (this.isEditMode() && this.listingId) {
      void this.router.navigate(['/listings', this.listingId]);
      return;
    }

    void this.router.navigateByUrl('/profile');
  }

  protected openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  protected handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  protected handleFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.uploadFiles(Array.from(files));
    }
  }

  protected handleFileSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length > 0) {
      this.uploadFiles(files);
    }

    input.value = '';
  }

  protected removeImage(index: number): void {
    this.images.update(images => images.filter((_, currentIndex) => currentIndex !== index));
  }

  protected startImageDrag(index: number): void {
    this.draggedImageIndex.set(index);
  }

  protected handleImageDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected dropImage(targetIndex: number): void {
    const sourceIndex = this.draggedImageIndex();
    this.draggedImageIndex.set(null);
    if (sourceIndex === null || sourceIndex === targetIndex) {
      return;
    }

    this.images.update(images => {
      const nextImages = [...images];
      const [movedImage] = nextImages.splice(sourceIndex, 1);
      nextImages.splice(targetIndex, 0, movedImage);
      return nextImages;
    });
  }

  protected endImageDrag(): void {
    this.draggedImageIndex.set(null);
  }

  protected submit(): void {
    if (!this.isEditMode() && !this.isConnectReady()) {
      this.errorMessage.set('Connect your Stripe seller account before creating a product.');
      this.refreshConnectStatus();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.images().length === 0) {
      this.errorMessage.set('Add at least one product image before saving the listing.');
      return;
    }

    const rawValue = this.form.getRawValue();
    const payload: ListingUpsertRequest = {
      title: rawValue.title.trim(),
      categoryId: rawValue.categoryId,
      description: rawValue.description.trim(),
      condition: rawValue.condition as ListingCondition,
      price: Number(rawValue.price),
      quantity: Number(rawValue.quantity),
      isNegotiable: rawValue.isNegotiable,
      city: rawValue.city.trim(),
      imageUrls: this.images().map(image => image.url)
    };

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const request$ =
      this.isEditMode() && this.listingId
        ? this.listingApi.updateListing(this.listingId, payload)
        : this.listingApi.createListing(payload);

    request$
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: listing => {
          void this.router.navigate(['/listings', listing.id]);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to save the listing right now.')
          );
        }
      });
  }

  protected requestDelete(): void {
    if (!this.isEditMode()) {
      return;
    }

    this.isDeleting.set(true);
  }

  protected closeDeleteDialog(): void {
    this.isDeleting.set(false);
  }

  protected confirmDelete(): void {
    if (!this.listingId) {
      return;
    }

    this.errorMessage.set(null);
    this.listingApi.deleteListing(this.listingId).subscribe({
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

  protected controlHasError(
    controlName: 'title' | 'categoryId' | 'description' | 'condition' | 'price' | 'quantity' | 'city'
  ): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  protected imageTrackBy(_: number, image: ListingEditorImage): string {
    return image.url;
  }

  protected formatCondition(condition: ListingCondition): string {
    return formatListingCondition(condition);
  }

  protected refreshConnectStatus(): void {
    if (this.isEditMode()) {
      return;
    }

    this.isConnectLoading.set(true);
    this.errorMessage.set(null);
    this.orderApi
      .createConnectOnboardingSession()
      .pipe(finalize(() => this.isConnectLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.isConnectReady.set(response.isComplete);
          if (!response.isComplete) {
            this.connectInstance = loadConnectAndInitialize({
              publishableKey: response.publishableKey,
              fetchClientSecret: async () => response.clientSecret,
              locale: 'en'
            });
            this.mountConnectOnboarding();
          }
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load Stripe Connect onboarding right now.')
          );
        }
      });
  }

  private loadPage(): void {
    if (this.isEditMode() && !this.listingId) {
      this.errorMessage.set('Listing id is missing for edit mode.');
      this.isLoading.set(false);
      return;
    }

    forkJoin({
      categories: this.listingApi.getCategories(),
      listing:
        this.isEditMode() && this.listingId
          ? this.listingApi.getListing(this.listingId)
          : of<ListingDetails | null>(null)
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: ({ categories, listing }) => {
          this.categories.set(categories);
          if (listing) {
            this.listing.set(listing);
            this.form.patchValue({
              title: listing.title,
              categoryId: listing.categoryId,
              description: listing.description,
              condition: listing.condition,
              price: listing.price,
              quantity: listing.quantity,
              isNegotiable: listing.isNegotiable,
              city: listing.city
            });
            this.images.set(
              listing.images.map(image => ({
                url: image.url,
                fileName: image.url.split('/').pop() ?? 'image',
                previewUrl: resolveApiUrl(image.url) ?? image.url
              }))
            );
          }

          if (!this.isEditMode()) {
            this.refreshConnectStatus();
          }
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load the listing form right now.')
          );
        }
      });
  }

  private uploadFiles(files: File[]): void {
    const remainingSlots = 12 - this.images().length;
    if (remainingSlots <= 0) {
      this.errorMessage.set('You can upload up to 12 listing images.');
      return;
    }

    const nextFiles = files.slice(0, remainingSlots);
    if (nextFiles.length !== files.length) {
      this.errorMessage.set('Only the first 12 listing images can be stored.');
    } else {
      this.errorMessage.set(null);
    }

    for (const file of nextFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
        this.errorMessage.set('Only JPG, PNG, and WEBP product images are supported.');
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        this.errorMessage.set('Each product image must be smaller than 8 MB.');
        return;
      }
    }

    this.isUploadingImages.set(true);
    this.listingApi
      .uploadImages(nextFiles)
      .pipe(finalize(() => this.isUploadingImages.set(false)))
      .subscribe({
        next: response => {
          this.images.update(images => [
            ...images,
            ...response.images.map(image => this.mapUploadedImage(image))
          ]);
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to upload listing images right now.')
          );
        }
      });
  }

  private mapUploadedImage(image: ListingImageUploadItem): ListingEditorImage {
    return {
      url: image.url,
      fileName: image.fileName,
      previewUrl: resolveApiUrl(image.url) ?? image.url
    };
  }

  private mountConnectOnboarding(): void {
    if (!this.connectInstance || !this.connectContainer || this.isConnectReady()) {
      return;
    }

    const element = this.connectInstance.create('account-onboarding');
    element.setOnLoadError(({ error }) => {
      this.errorMessage.set(
        `Stripe onboarding could not be loaded (${error}). Enable Stripe Connect in the sandbox and try again.`
      );
    });
    this.connectContainer.nativeElement.replaceChildren(element);
  }
}
