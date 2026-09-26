import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [CommonModule, SiteShellComponent],
  templateUrl: './error-page.html',
  styleUrl: './error-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly code = computed(() => this.route.snapshot.queryParamMap.get('code') ?? this.route.snapshot.data['code'] ?? '500');
  protected readonly title = computed(() => {
    switch (this.code()) {
      case '404':
        return 'Page not found';
      case '403':
        return 'Access denied';
      default:
        return 'Something went wrong';
    }
  });
  protected readonly description = computed(() => {
    switch (this.code()) {
      case '404':
        return 'The page you are looking for does not exist or has been moved.';
      case '403':
        return 'You do not have permission to open this area of the marketplace.';
      default:
        return 'An unexpected error occurred. Please return to the marketplace and try again.';
    }
  });

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
