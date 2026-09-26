import { CommonModule } from '@angular/common';
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
import { ChatApiService } from '../../features/chats/chat-api.service';
import { finalize } from 'rxjs/operators';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-admin-disputes-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SiteShellComponent],
  templateUrl: './admin-disputes-page.html',
  styleUrl: './admin-disputes-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDisputesPageComponent {
  private readonly disputeSeenKey = 'bse.admin.tabs.disputes';
  private readonly chatsSeenKey = 'bse.admin.tabs.chats';
  private readonly adminApi = inject(AdminApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly selectedSort = signal<'newest' | 'oldest'>('newest');
  protected readonly isSortMenuOpen = signal(false);
  protected readonly selectedReview = signal<Review | null>(null);
  protected readonly hasUnseenChats = signal(false);
  protected readonly filteredReviews = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();
    const filtered = this.reviews().filter(review => {
      return (
        !normalizedSearch ||
        (review.listingTitle ?? '').toLowerCase().includes(normalizedSearch) ||
        review.comment.toLowerCase().includes(normalizedSearch)
      );
    });

    return filtered.sort((left, right) => {
      const leftTime = new Date(left.createdAtUtc).getTime();
      const rightTime = new Date(right.createdAtUtc).getTime();
      return this.selectedSort() === 'newest' ? rightTime - leftTime : leftTime - rightTime;
    });
  });

  constructor() {
    this.loadDisputes();
  }

  protected openUsers(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected openSupportChats(): void {
    void this.router.navigateByUrl('/admin/chats');
  }

  protected openReports(): void {
    void this.router.navigateByUrl('/admin/reports');
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected toggleSortMenu(event: Event): void {
    event.stopPropagation();
    this.isSortMenuOpen.update(value => !value);
  }

  protected updateSort(value: 'newest' | 'oldest'): void {
    this.selectedSort.set(value);
  }

  protected applySort(): void {
    this.isSortMenuOpen.set(false);
  }

  protected resetSort(): void {
    this.selectedSort.set('newest');
    this.isSortMenuOpen.set(false);
  }

  protected openReview(review: Review): void {
    openRouteInNewTab(this.router, ['/admin/disputes', review.id]);
  }

  protected closeReview(): void {
    this.selectedReview.set(null);
  }

  protected keepReview(reviewId: string): void {
    this.updateReviewStatus(reviewId, 'Published');
  }

  protected hideReview(reviewId: string): void {
    this.updateReviewStatus(reviewId, 'Hidden');
  }

  protected removeReview(reviewId: string): void {
    this.updateReviewStatus(reviewId, 'Removed');
  }

  protected statusLabel(status: Review['status']): string {
    switch (status) {
      case 'Hidden':
        return 'Hidden';
      case 'Removed':
        return 'Removed';
      case 'Disputed':
        return 'Disputed';
      default:
        return 'Active';
    }
  }

  private loadDisputes(): void {
    this.adminApi
      .getDisputedReviews()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: reviews => {
          this.reviews.set(reviews);
          this.persistSeen(
            this.disputeSeenKey,
            reviews.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`)
          );
          this.chatApi
            .getMyChats(undefined, true)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: chats => {
                this.hasUnseenChats.set(
                  this.hasUnseen(
                    this.chatsSeenKey,
                    chats
                      .filter(chat => chat.isSupport)
                      .map(chat => `${chat.id}|${chat.lastMessageAtUtc}|${chat.unreadCount}|${chat.assignedAdminId ?? 'unassigned'}`)
                  )
                );
              }
            });
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load disputed reviews right now.'));
        }
      });
  }

  private updateReviewStatus(reviewId: string, status: Review['status']): void {
    this.isSubmitting.set(true);
    this.adminApi
      .moderateReview(reviewId, status)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updatedReview => {
          if (updatedReview.status === 'Disputed') {
            this.reviews.update(items =>
              items.map(item => (item.id === updatedReview.id ? updatedReview : item))
            );
            return;
          }

          this.reviews.update(items => items.filter(item => item.id !== updatedReview.id));
          if (this.selectedReview()?.id === updatedReview.id) {
            this.selectedReview.set(null);
          }
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to moderate this review right now.'));
        }
      });
  }

  private hasUnseen(storageKey: string, signatures: string[]): boolean {
    if (typeof window === 'undefined' || signatures.length === 0) {
      return false;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return true;
    }

    try {
      const seen = new Set(JSON.parse(raw) as string[]);
      return signatures.some(signature => !seen.has(signature));
    } catch {
      return true;
    }
  }

  private persistSeen(storageKey: string, signatures: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(signatures));
  }
}
