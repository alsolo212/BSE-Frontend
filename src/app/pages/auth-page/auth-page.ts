import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { extractApiError } from '../../core/http/api-error';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type AuthMode = 'login' | 'register';

const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!password || !confirmPassword || password === confirmPassword) {
    return null;
  }

  return { passwordMismatch: true };
};

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SiteShellComponent],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthPageComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loginPasswordVisible = signal(false);
  protected readonly registerPasswordVisible = signal(false);
  protected readonly registerConfirmPasswordVisible = signal(false);

  protected readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  protected readonly registerForm = this.formBuilder.group(
    {
      userName: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[0-9]*$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    },
    {
      validators: [passwordMatchValidator]
    }
  );

  protected setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
  }

  protected togglePasswordVisibility(target: 'login' | 'register' | 'confirm'): void {
    switch (target) {
      case 'login':
        this.loginPasswordVisible.update(value => !value);
        break;
      case 'register':
        this.registerPasswordVisible.update(value => !value);
        break;
      default:
        this.registerConfirmPasswordVisible.update(value => !value);
        break;
    }
  }

  protected submit(): void {
    if (this.mode() === 'login') {
      this.submitLogin();
      return;
    }

    this.submitRegister();
  }

  protected controlHasError(
    form: FormGroup,
    controlName: string,
    errorCode?: string
  ): boolean {
    const control = form.controls[controlName];
    if (!control || !control.touched) {
      return false;
    }

    return errorCode ? control.hasError(errorCode) : control.invalid;
  }

  protected registerFormHasError(errorCode: string): boolean {
    return this.registerForm.touched && this.registerForm.hasError(errorCode);
  }

  private submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const rawValue = this.loginForm.getRawValue();
    this.authService
      .login({
        email: rawValue.email.trim(),
        password: rawValue.password
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/profile');
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to log in with the provided credentials.')
          );
        }
      });
  }

  private submitRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const rawValue = this.registerForm.getRawValue();
    this.authService
      .register({
        userName: rawValue.userName.trim(),
        email: rawValue.email.trim(),
        phone: rawValue.phone.trim() || null,
        password: rawValue.password,
        confirmPassword: rawValue.confirmPassword
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/profile');
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to create an account right now.')
          );
        }
      });
  }
}
