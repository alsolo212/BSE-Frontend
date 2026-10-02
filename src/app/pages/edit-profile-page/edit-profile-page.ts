import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { ProfileApiService } from '../../features/profile/profile-api.service';
import { UserProfile } from '../../features/profile/profile.models';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

const setPasswordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!newPassword || !confirmPassword || newPassword === confirmPassword) {
    return null;
  }

  return { passwordMismatch: true };
};

@Component({
  selector: 'app-edit-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SiteShellComponent],
  templateUrl: './edit-profile-page.html',
  styleUrl: './edit-profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditProfilePageComponent {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly profileApi = inject(ProfileApiService);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly isUploadingAvatar = signal(false);
  protected readonly isDragging = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly hasPassword = signal(true);
  protected readonly showSetPasswordDialog = signal(false);
  protected readonly isSettingPassword = signal(false);
  protected readonly setPasswordError = signal<string | null>(null);
  protected readonly avatarPreviewUrl = signal<string | null>(null);
  protected readonly selectedAvatarUrl = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);
  protected readonly newPasswordVisible = signal(false);
  protected readonly confirmNewPasswordVisible = signal(false);

  protected readonly form = this.formBuilder.group({
    userName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.pattern(/^[0-9]*$/)]],
    currentPassword: ['', [Validators.required]]
  });

  protected readonly setPasswordForm = this.formBuilder.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    },
    {
      validators: [setPasswordMatchValidator]
    }
  );

  constructor() {
    this.loadProfile();
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/profile');
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update(value => !value);
  }

  protected toggleNewPasswordVisibility(target: 'new' | 'confirm'): void {
    if (target === 'new') {
      this.newPasswordVisible.update(value => !value);
      return;
    }

    this.confirmNewPasswordVisible.update(value => !value);
  }

  protected closeSetPasswordDialog(): void {
    this.showSetPasswordDialog.set(false);
    this.setPasswordError.set(null);
    this.setPasswordForm.reset({
      newPassword: '',
      confirmPassword: ''
    });
  }

  protected submitSetPassword(): void {
    if (this.setPasswordForm.invalid) {
      this.setPasswordForm.markAllAsTouched();
      return;
    }

    this.isSettingPassword.set(true);
    this.setPasswordError.set(null);

    const rawValue = this.setPasswordForm.getRawValue();
    this.authService
      .setPassword(rawValue)
      .pipe(finalize(() => this.isSettingPassword.set(false)))
      .subscribe({
        next: user => {
          this.hasPassword.set(user.hasPassword !== false);
          this.configureCurrentPasswordField(true);
          this.closeSetPasswordDialog();
        },
        error: error => {
          this.setPasswordError.set(
            extractApiError(error, 'Unable to set a password right now.')
          );
        }
      });
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

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentProfile = this.profile();
    if (!currentProfile) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const rawValue = this.form.getRawValue();
    this.profileApi
      .updateMyProfile({
        userName: rawValue.userName.trim(),
        email: rawValue.email.trim(),
        phone: rawValue.phone.trim() || null,
        currentPassword: rawValue.currentPassword,
        profileImageUrl: this.selectedAvatarUrl() ?? currentProfile.profileImageUrl ?? null
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: updatedProfile => {
          this.authService.updateCurrentUser({
            userName: updatedProfile.userName,
            email: updatedProfile.email,
            profileImageUrl: updatedProfile.profileImageUrl
          });

          void this.router.navigateByUrl('/profile');
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to update the profile right now.')
          );
        }
      });
  }

  protected controlHasError(controlName: 'userName' | 'email' | 'phone' | 'currentPassword'): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  private loadProfile(): void {
    forkJoin({
      profile: this.profileApi.getMyProfile(),
      currentUser: this.authService.loadCurrentUser()
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: ({ profile, currentUser }) => {
          const userHasPassword = currentUser.hasPassword !== false;
          this.hasPassword.set(userHasPassword);
          this.configureCurrentPasswordField(userHasPassword);
          this.showSetPasswordDialog.set(!userHasPassword);
          this.profile.set(profile);
          this.selectedAvatarUrl.set(profile.profileImageUrl ?? null);
          this.avatarPreviewUrl.set(resolveApiUrl(profile.profileImageUrl));
          this.form.patchValue({
            userName: profile.userName,
            email: profile.email,
            phone: profile.phone ?? '',
            currentPassword: ''
          });
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to load the editable profile.')
          );
        }
      });
  }

  private configureCurrentPasswordField(hasPassword: boolean): void {
    const currentPasswordControl = this.form.controls.currentPassword;
    currentPasswordControl.setValidators(hasPassword ? [Validators.required] : []);
    currentPasswordControl.updateValueAndValidity();
  }

  private uploadAvatar(file: File): void {
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

    this.profileApi
      .uploadAvatar(file)
      .pipe(finalize(() => this.isUploadingAvatar.set(false)))
      .subscribe({
        next: response => {
          this.selectedAvatarUrl.set(response.profileImageUrl);
          this.avatarPreviewUrl.set(resolveApiUrl(response.profileImageUrl));
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to upload the avatar right now.')
          );
        }
      });
  }
}
