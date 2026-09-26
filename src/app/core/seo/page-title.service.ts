import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly browserTitle = inject(Title);

  set(title?: string | null): void {
    const normalizedTitle = title?.trim();
    this.browserTitle.setTitle(normalizedTitle || 'Buy Sell Easy');
  }

  setProductTitle(title: string): void {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length <= 60) {
      this.set(normalizedTitle);
      return;
    }

    this.set(`${normalizedTitle.slice(0, 57).trimEnd()}...`);
  }
}
