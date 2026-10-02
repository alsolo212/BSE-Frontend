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
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiConfig } from '../../core/config/api.config';
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
export class AuthPageComponent implements AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loginPasswordVisible = signal(false);
  protected readonly registerPasswordVisible = signal(false);
  protected readonly registerConfirmPasswordVisible = signal(false);
  protected readonly isGoogleSubmitting = signal(false);

  @ViewChild('googleButton', { static: true })
  private readonly googleButton?: ElementRef<HTMLDivElement>;

  private googleInitializationTimer: number | null = null;

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

  ngAfterViewInit(): void {
    this.initializeGoogleButtonWhenReady();
  }

  ngOnDestroy(): void {
    if (this.googleInitializationTimer !== null) {
      window.clearTimeout(this.googleInitializationTimer);
    }
  }

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

  private initializeGoogleButtonWhenReady(): void {
    const googleIdentity = window.google?.accounts.id;
    if (googleIdentity && this.googleButton) {
      googleIdentity.initialize({
        client_id: apiConfig.googleClientId,
        callback: response => this.submitGoogle(response.credential),
        auto_select: false,
        cancel_on_tap_outside: true
      });

      googleIdentity.renderButton(this.googleButton.nativeElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 400,
        locale: 'en'
      });
      return;
    }

    this.googleInitializationTimer = window.setTimeout(
      () => this.initializeGoogleButtonWhenReady(),
      100
    );
  }

  private submitGoogle(idToken: string): void {
    if (this.isGoogleSubmitting()) {
      return;
    }

    this.isGoogleSubmitting.set(true);
    this.errorMessage.set(null);

    this.authService
      .loginWithGoogle({ idToken })
      .pipe(finalize(() => this.isGoogleSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/profile');
        },
        error: error => {
          this.errorMessage.set(
            extractApiError(error, 'Unable to sign in with Google right now.')
          );
        }
      });
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
