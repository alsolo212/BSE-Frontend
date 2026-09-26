import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-site-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-shell.component.html',
  styleUrl: './site-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SiteShellComponent {
  private readonly authService = inject(AuthService);
  protected readonly isMobileMenuOpen = signal(false);

  protected readonly productsRoute = '/products';
  protected readonly homeRoute = '/';
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly cartRoute = computed(() => (this.isAuthenticated() ? '/cart' : '/auth'));
  protected readonly profileRoute = computed(() =>
    this.isAuthenticated() ? '/profile' : '/auth'
  );
  protected readonly addProductRoute = computed(() =>
    this.isAuthenticated() ? '/listings/new' : '/auth'
  );
  protected readonly adminRoute = '/admin/users';

  protected openMobileMenu(): void {
    this.isMobileMenuOpen.set(true);
  }

  protected closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }
}
