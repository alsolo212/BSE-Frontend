import { HttpErrorResponse } from '@angular/common/http';

export function extractApiError(error: unknown, fallbackMessage = 'Something went wrong.'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallbackMessage;
  }

  if (error.status === 0) {
    return 'Unable to reach the API. Make sure the backend is running.';
  }

  const errorBody = error.error;
  if (typeof errorBody === 'string' && errorBody.trim()) {
    return errorBody;
  }

  if (typeof errorBody?.message === 'string' && errorBody.message.trim()) {
    return errorBody.message;
  }

  if (errorBody?.errors && typeof errorBody.errors === 'object') {
    const messages = Object.values(errorBody.errors as Record<string, string[]>)
      .flat()
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  if (typeof errorBody?.title === 'string' && errorBody.title.trim()) {
    return errorBody.title;
  }

  if (error.status === 401) {
    return 'Authentication failed. Check your credentials and try again.';
  }

  return fallbackMessage;
}
