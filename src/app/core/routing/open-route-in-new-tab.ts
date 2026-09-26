import { Router } from '@angular/router';

export function openRouteInNewTab(router: Router, commands: readonly unknown[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const urlTree = router.createUrlTree(commands as any[]);
  const serializedUrl = router.serializeUrl(urlTree);
  window.open(serializedUrl, '_blank', 'noopener,noreferrer');
}
