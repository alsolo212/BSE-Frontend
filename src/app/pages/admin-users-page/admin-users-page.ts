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
import { forkJoin, timer } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { ChatApiService } from '../../features/chats/chat-api.service';
import { AdminUserListItem } from '../../features/admin/admin.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type RoleFilter = 'all' | 'admin' | 'user';
type UserSort = 'newest' | 'oldest' | 'worst-reviews';

@Component({
  selector: 'app-admin-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SiteShellComponent],
  templateUrl: './admin-users-page.html',
  styleUrl: './admin-users-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUsersPageComponent {
  private readonly disputeSeenKey = 'bse.admin.tabs.disputes';
  private readonly chatsSeenKey = 'bse.admin.tabs.chats';
  private readonly reportsSeenKey = 'bse.admin.tabs.reports';
  private readonly adminApi = inject(AdminApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly users = signal<AdminUserListItem[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly roleFilter = signal<RoleFilter>('all');
  protected readonly selectedSort = signal<UserSort>('newest');
  protected readonly isSortMenuOpen = signal(false);
  protected readonly hasUnseenDisputes = signal(false);
  protected readonly hasUnseenChats = signal(false);
  protected readonly hasUnseenReports = signal(false);

  protected readonly filteredUsers = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();
    const roleFilter = this.roleFilter();

    const filtered = this.users().filter(user => {
      const matchesSearch =
        !normalizedSearch ||
        user.userName.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch);
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin'
          ? user.roles.includes('Admin')
          : !user.roles.includes('Admin'));

      return matchesSearch && matchesRole;
    });

    return filtered.sort((left, right) => {
      switch (this.selectedSort()) {
        case 'oldest':
          return left.id.localeCompare(right.id);
        case 'worst-reviews':
          return left.activeListingsCount - right.activeListingsCount;
        default:
          return right.id.localeCompare(left.id);
      }
    });
  });

  constructor() {
    this.loadUsers();
    this.startLiveRefresh();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected setRoleFilter(value: RoleFilter): void {
    this.roleFilter.set(value);
  }

  protected toggleSortMenu(event: Event): void {
    event.stopPropagation();
    this.isSortMenuOpen.update(value => !value);
  }

  protected updateSort(value: UserSort): void {
    this.selectedSort.set(value);
  }

  protected applySort(): void {
    this.isSortMenuOpen.set(false);
  }

  protected resetSort(): void {
    this.roleFilter.set('all');
    this.selectedSort.set('newest');
    this.isSortMenuOpen.set(false);
  }

  protected openDisputes(): void {
    void this.router.navigateByUrl('/admin/disputes');
  }

  protected openSupportChats(): void {
    void this.router.navigateByUrl('/admin/chats');
  }

  protected openReports(): void {
    void this.router.navigateByUrl('/admin/reports');
  }

  protected openUser(userId: string): void {
    void this.router.navigate(['/admin/users', userId]);
  }

  protected openEditUser(userId: string, event?: Event): void {
    event?.stopPropagation();
    void this.router.navigate(['/admin/users', userId, 'edit']);
  }

  protected toggleBlock(user: AdminUserListItem, event?: Event): void {
    event?.stopPropagation();
    this.adminApi
      .toggleBlock(user.id, !user.isBlocked)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedUser => {
          this.users.update(items =>
            items.map(item => (item.id === updatedUser.id ? updatedUser : item))
          );
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update block status.'));
        }
      });
  }

  protected roleLabel(user: AdminUserListItem): string {
    if (user.roles.includes('SuperAdmin')) {
      return 'SuperAdmin';
    }

    return user.roles.includes('Admin') ? 'Admin' : 'User';
  }

  protected avatarUrl(user: AdminUserListItem): string | null {
    return resolveApiUrl(user.profileImageUrl);
  }

  protected userInitial(user: AdminUserListItem): string {
    return user.userName?.trim().charAt(0).toUpperCase() || 'B';
  }

  private loadUsers(): void {
    forkJoin({
      users: this.adminApi.getUsers(),
      disputes: this.reviewApi.getDisputedReviews(),
      chats: this.chatApi.getMyChats(undefined, true),
      reports: this.adminApi.getListingReports()
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ users, disputes, chats, reports }) => {
          this.users.set(users);
          this.hasUnseenDisputes.set(
            this.hasUnseen(this.disputeSeenKey, disputes.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`))
          );
          this.hasUnseenChats.set(
            this.hasUnseen(
              this.chatsSeenKey,
              chats.filter(chat => chat.isSupport).map(chat => `${chat.id}|${chat.lastMessageAtUtc}|${chat.unreadCount}|${chat.assignedAdminId ?? 'unassigned'}`)
            )
          );
          this.hasUnseenReports.set(
            this.hasUnseen(
              this.reportsSeenKey,
              reports.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`)
            )
          );
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load users right now.'));
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

  private startLiveRefresh(): void {
    timer(20000, 20000)
      .pipe(
        switchMap(() =>
          forkJoin({
            disputes: this.reviewApi.getDisputedReviews(),
            chats: this.chatApi.getMyChats(undefined, true),
            reports: this.adminApi.getListingReports()
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ disputes, chats, reports }) => {
          this.hasUnseenDisputes.set(
            this.hasUnseen(
              this.disputeSeenKey,
              disputes.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`)
            )
          );
          this.hasUnseenChats.set(
            this.hasUnseen(
              this.chatsSeenKey,
              chats
                .filter(chat => chat.isSupport)
                .map(chat => `${chat.id}|${chat.lastMessageAtUtc}|${chat.unreadCount}|${chat.assignedAdminId ?? 'unassigned'}`)
            )
          );
          this.hasUnseenReports.set(
            this.hasUnseen(
              this.reportsSeenKey,
              reports.map(item => `${item.id}|${item.createdAtUtc}|${item.status}`)
            )
          );
        }
      });
  }
}
