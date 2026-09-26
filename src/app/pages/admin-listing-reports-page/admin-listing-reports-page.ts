import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { extractApiError } from '../../core/http/api-error';
import { openRouteInNewTab } from '../../core/routing/open-route-in-new-tab';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { ListingReport } from '../../features/admin/admin.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-admin-listing-reports-page',
  standalone: true,
  imports: [CommonModule, SiteShellComponent],
  templateUrl: './admin-listing-reports-page.html',
  styleUrl: './admin-listing-reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminListingReportsPageComponent {
  private readonly reportsSeenKey = 'bse.admin.tabs.reports';
  private readonly adminApi = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reports = signal<ListingReport[]>([]);
  protected readonly selectedReport = signal<ListingReport | null>(null);

  constructor() {
    this.loadReports();
  }

  protected openUsers(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected openDisputes(): void {
    void this.router.navigateByUrl('/admin/disputes');
  }

  protected openChats(): void {
    void this.router.navigateByUrl('/admin/chats');
  }

  protected openReport(report: ListingReport): void {
    this.selectedReport.set(report);
  }

  protected closeReport(): void {
    this.selectedReport.set(null);
  }

  protected keepListing(reportId: string): void {
    this.updateReport(reportId, false);
  }

  protected blockListing(reportId: string): void {
    this.updateReport(reportId, true);
  }

  protected openListing(report: ListingReport): void {
    openRouteInNewTab(this.router, ['/listings', report.listingId]);
  }

  private loadReports(): void {
    this.adminApi
      .getListingReports()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: reports => {
          this.reports.set(reports);
          this.persistSeen(reports.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`));
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load listing reports right now.'));
        }
      });
  }

  private updateReport(reportId: string, blockListing: boolean): void {
    this.isSubmitting.set(true);
    this.adminApi
      .moderateListingReport(reportId, blockListing)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          this.reports.update(items => items.filter(item => item.id !== updated.id));
          if (this.selectedReport()?.id === updated.id) {
            this.selectedReport.set(null);
          }
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to moderate this listing report.'));
        }
      });
  }

  private persistSeen(signatures: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.reportsSeenKey, JSON.stringify(signatures));
  }
}
