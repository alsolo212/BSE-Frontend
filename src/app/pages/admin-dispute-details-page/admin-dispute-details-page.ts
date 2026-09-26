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
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { extractApiError } from '../../core/http/api-error';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { AdminUserDetails } from '../../features/admin/admin.models';
import { Review } from '../../features/reviews/review.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-admin-dispute-details-page',
  standalone: true,
  imports: [CommonModule, SiteShellComponent],
  templateUrl: './admin-dispute-details-page.html',
  styleUrl: './admin-dispute-details-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDisputeDetailsPageComponent {
  private readonly adminApi = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly dispute = signal<Review | null>(null);
  protected readonly reviewer = signal<AdminUserDetails | null>(null);
  protected readonly reporter = signal<AdminUserDetails | null>(null);
  protected readonly copiedEmail = signal<'reviewer' | 'reporter' | null>(null);

  protected readonly reviewerEmail = computed(() => this.reviewer()?.email ?? '');
  protected readonly reporterEmail = computed(() => this.reporter()?.email ?? '');

  constructor() {
    const disputeId = this.route.snapshot.paramMap.get('id');
    if (!disputeId) {
      void this.router.navigateByUrl('/error?code=404');
      return;
    }

    this.loadDispute(disputeId);
  }

  protected copyEmail(kind: 'reviewer' | 'reporter'): void {
    const email = kind === 'reviewer' ? this.reviewerEmail() : this.reporterEmail();
    if (!email || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(email);
    this.copiedEmail.set(kind);
  }

  protected declineDispute(): void {
    const disputeId = this.dispute()?.id;
    if (!disputeId) {
      return;
    }

    this.updateReviewStatus(disputeId, 'Hidden');
  }

  protected removeReview(): void {
    const disputeId = this.dispute()?.id;
    if (!disputeId) {
      return;
    }

    this.updateReviewStatus(disputeId, 'Removed');
  }

  protected reviewStars(rating: number): number[] {
    return [1, 2, 3, 4, 5].map(star => (star <= rating ? star : -star));
  }

  private loadDispute(disputeId: string): void {
    this.adminApi
      .getDisputedReviews()
      .pipe(
        switchMap(disputes => {
          const dispute = disputes.find(item => item.id === disputeId) ?? null;
          if (!dispute) {
            throw new Error('Dispute not found.');
          }

          this.dispute.set(dispute);
          return forkJoin({
            reviewer: this.adminApi.getUser(dispute.authorId),
            reporter: this.adminApi.getUser(dispute.targetUserId)
          });
        }),
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ reviewer, reporter }) => {
          this.reviewer.set(reviewer);
          this.reporter.set(reporter);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load this dispute.'));
        }
      });
  }

  private updateReviewStatus(reviewId: string, status: Review['status']): void {
    this.isSubmitting.set(true);
    this.adminApi
      .moderateReview(reviewId, status)
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/admin/disputes');
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to moderate this review right now.'));
        }
      });
  }
}
