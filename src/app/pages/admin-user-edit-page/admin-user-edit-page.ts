import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { AdminApiService } from '../../features/admin/admin-api.service';
import { AdminUserDetails } from '../../features/admin/admin.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type EditableRole = 'User' | 'Admin';

@Component({
  selector: 'app-admin-user-edit-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SiteShellComponent],
  templateUrl: './admin-user-edit-page.html',
  styleUrl: './admin-user-edit-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUserEditPageComponent {
  private readonly adminApi = inject(AdminApiService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly isUploadingAvatar = signal(false);
  protected readonly isDragging = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly user = signal<AdminUserDetails | null>(null);
  protected readonly avatarPreviewUrl = signal<string | null>(null);
  protected readonly selectedAvatarUrl = signal<string | null>(null);
  protected readonly selectedRole = signal<EditableRole>('User');
  protected readonly isSuperAdmin = this.authService.isSuperAdmin;

  protected readonly form = this.formBuilder.group({
    userName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.pattern(/^[0-9]*$/)]]
  });

  constructor() {
    const userId = this.route.snapshot.paramMap.get('id');
    if (!userId) {
      void this.router.navigateByUrl('/error?code=404');
      return;
    }

    this.loadUser(userId);
  }

  protected goBack(): void {
    const userId = this.user()?.id;
    void this.router.navigateByUrl(userId ? `/admin/users/${userId}` : '/admin/users');
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

    const file = event.dataTransfer?.files.item(0);
    if (file) {
      this.uploadAvatar(file);
    }
  }

  protected handleFileSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      this.uploadAvatar(file);
    }

    input.value = '';
  }

  protected setRole(role: EditableRole): void {
    this.selectedRole.set(role);
  }

  protected submit(): void {
    const currentUser = this.user();
    if (!currentUser) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.adminApi
      .updateUser(currentUser.id, {
        userName: rawValue.userName.trim(),
        email: rawValue.email.trim(),
        phone: rawValue.phone.trim() || null,
        profileImageUrl: this.selectedAvatarUrl() ?? currentUser.profileImageUrl ?? null,
        role: this.isSuperAdmin() ? this.selectedRole() : null
      })
      .pipe(finalize(() => this.isSubmitting.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updatedUser => {
          this.user.set(updatedUser);
          void this.router.navigateByUrl(`/admin/users/${updatedUser.id}`);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to update this user right now.'));
        }
      });
  }

  protected controlHasError(controlName: 'userName' | 'email' | 'phone'): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  private loadUser(userId: string): void {
    this.adminApi
      .getUser(userId)
      .pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: user => {
          this.user.set(user);
          this.selectedAvatarUrl.set(user.profileImageUrl ?? null);
          this.avatarPreviewUrl.set(resolveApiUrl(user.profileImageUrl));
          this.selectedRole.set(user.roles.includes('Admin') ? 'Admin' : 'User');
          this.form.patchValue({
            userName: user.userName,
            email: user.email,
            phone: user.phone ?? ''
          });
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load this user.'));
        }
      });
  }

  private uploadAvatar(file: File): void {
    const userId = this.user()?.id;
    if (!userId) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      this.errorMessage.set('Only JPG, PNG, and WEBP images are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.errorMessage.set('Avatar file must be smaller than 5 MB.');
      return;
    }

    this.isUploadingAvatar.set(true);
    this.errorMessage.set(null);

    this.adminApi
      .uploadAvatar(userId, file)
      .pipe(finalize(() => this.isUploadingAvatar.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.selectedAvatarUrl.set(response.profileImageUrl);
          this.avatarPreviewUrl.set(resolveApiUrl(response.profileImageUrl));
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to upload the avatar right now.'));
        }
      });
  }
}
