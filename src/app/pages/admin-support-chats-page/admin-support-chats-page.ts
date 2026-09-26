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
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { resolveApiUrl } from '../../core/config/api.config';
import { extractApiError } from '../../core/http/api-error';
import { ChatApiService } from '../../features/chats/chat-api.service';
import { ChatRealtimeService } from '../../features/chats/chat-realtime.service';
import { ChatMessage, ChatSummary } from '../../features/chats/chat.models';
import { ReviewApiService } from '../../features/reviews/review-api.service';
import { SiteShellComponent } from '../../shared/site-shell/site-shell.component';

type SupportChatScope = 'all' | 'mine';

@Component({
  selector: 'app-admin-support-chats-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SiteShellComponent],
  templateUrl: './admin-support-chats-page.html',
  styleUrl: './admin-support-chats-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminSupportChatsPageComponent {
  private readonly seenStorageKey = 'bse.admin.tabs.chats';
  private joinedChatId: string | null = null;
  private realtimeConnected = false;

  private readonly authService = inject(AuthService);
  private readonly chatApi = inject(ChatApiService);
  private readonly chatRealtime = inject(ChatRealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly router = inject(Router);

  protected readonly isLoading = signal(true);
  protected readonly isMessagesLoading = signal(false);
  protected readonly isSendingMessage = signal(false);
  protected readonly isUploadingAttachment = signal(false);
  protected readonly isClaimingChat = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly chats = signal<ChatSummary[]>([]);
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly activeChatId = signal<string | null>(null);
  protected readonly messageDraft = signal('');
  protected readonly scope = signal<SupportChatScope>('all');
  protected readonly hasUnseenChats = signal(false);
  protected readonly hasUnseenDisputes = signal(false);
  protected readonly pendingClaimChat = signal<ChatSummary | null>(null);

  protected readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);
  protected readonly isSuperAdmin = computed(() => this.authService.isSuperAdmin());
  protected readonly activeChat = computed(() =>
    this.chats().find(chat => chat.id === this.activeChatId()) ?? null
  );
  protected readonly filteredChats = computed(() => {
    const scope = this.scope();
    const currentUserId = this.currentUserId();
    const items = [...this.chats()];

    const filtered =
      scope === 'all'
        ? items
        : items.filter(chat =>
            chat.isAssignedToCurrentAdmin ||
            chat.assignedAdminId === currentUserId ||
            (!chat.assignedAdminId && this.isSuperAdmin())
          );

    return filtered.sort(
      (left, right) =>
        new Date(right.lastMessageAtUtc).getTime() - new Date(left.lastMessageAtUtc).getTime()
    );
  });
  protected readonly canSendMessage = computed(() => {
    return !!this.activeChatId() && this.messageDraft().trim().length > 0 && !this.isSendingMessage();
  });

  constructor() {
    this.chatRealtime.messageReceived$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(message => {
        if (message.chatId !== this.activeChatId()) {
          return;
        }

        this.chatMessages.update(items =>
          items.some(item => item.id === message.id) ? items : [...items, message]
        );
      });

    this.chatRealtime.summaryUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(summary => {
        if (!summary.isSupport) {
          return;
        }

        this.syncSupportChats();
      });

    this.destroyRef.onDestroy(() => {
      if (this.joinedChatId) {
        void this.chatRealtime.leaveChat(this.joinedChatId);
      }

      if (this.realtimeConnected) {
        void this.chatRealtime.disconnect();
      }
    });

    this.loadPage();
  }

  protected openUsers(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected openDisputes(): void {
    void this.router.navigateByUrl('/admin/disputes');
  }

  protected openReports(): void {
    void this.router.navigateByUrl('/admin/reports');
  }

  protected setScope(scope: SupportChatScope): void {
    this.scope.set(scope);

    if (this.activeChatId() && this.filteredChats().some(chat => chat.id === this.activeChatId())) {
      return;
    }

    const nextChat = this.filteredChats()[0] ?? null;
    if (nextChat) {
      this.openChat(nextChat);
      return;
    }

    this.activeChatId.set(null);
    this.chatMessages.set([]);
  }

  protected openUserProfile(): void {
    const currentChat = this.activeChat();
    if (!currentChat) {
      return;
    }

    void this.router.navigate(['/admin/users', currentChat.counterpartyId]);
  }

  protected openChat(chat: ChatSummary): void {
    if (chat.isBusy && !chat.isAssignedToCurrentAdmin && !this.isSuperAdmin()) {
      this.errorMessage.set('This support chat is already taken by another admin.');
      return;
    }

    if (!this.isSuperAdmin() && !chat.isAssignedToCurrentAdmin && !chat.assignedAdminId) {
      this.pendingClaimChat.set(chat);
      return;
    }

    this.activeChatId.set(chat.id);
    this.loadMessages(chat.id);
  }

  protected closeClaimDialog(): void {
    this.pendingClaimChat.set(null);
  }

  protected confirmClaimChat(): void {
    const chat = this.pendingClaimChat();
    if (!chat) {
      return;
    }

    this.isClaimingChat.set(true);
    this.chatApi
      .claimSupportChat(chat.id)
      .pipe(finalize(() => this.isClaimingChat.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: claimedChat => {
          this.mergeChat(claimedChat);
          this.pendingClaimChat.set(null);
          this.activeChatId.set(claimedChat.id);
          this.loadMessages(claimedChat.id);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to join this support chat.'));
        }
      });
  }

  protected updateMessageDraft(value: string): void {
    this.messageDraft.set(value);
  }

  protected sendMessage(): void {
    const chatId = this.activeChatId();
    const content = this.messageDraft().trim();
    if (!chatId || !content) {
      return;
    }

    this.isSendingMessage.set(true);
    this.chatApi
      .sendMessage(chatId, { content })
      .pipe(finalize(() => this.isSendingMessage.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: message => {
          this.chatMessages.update(items =>
            items.some(item => item.id === message.id) ? items : [...items, message]
          );
          this.messageDraft.set('');
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to reply right now.'));
        }
      });
  }

  protected sendAttachment(fileInput: HTMLInputElement): void {
    const chatId = this.activeChatId();
    const file = fileInput.files?.item(0);
    if (!chatId || !file) {
      return;
    }

    this.isUploadingAttachment.set(true);
    this.chatApi
      .uploadAttachment(chatId, file)
      .pipe(
        finalize(() => {
          this.isUploadingAttachment.set(false);
          fileInput.value = '';
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: uploaded => {
          this.chatApi
            .sendMessage(chatId, {
              content: this.messageDraft().trim(),
              attachmentUrl: uploaded.attachmentUrl,
              type: uploaded.type
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: message => {
                this.chatMessages.update(items =>
                  items.some(item => item.id === message.id) ? items : [...items, message]
                );
                this.messageDraft.set('');
              },
              error: error => {
                this.errorMessage.set(extractApiError(error, 'Unable to send attachment.'));
              }
            });
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to upload attachment.'));
        }
      });
  }

  protected chatAvatarUrl(chat?: ChatSummary | null): string | null {
    return resolveApiUrl(chat?.counterpartyAvatarUrl);
  }

  protected attachmentUrl(message: ChatMessage): string | null {
    return resolveApiUrl(message.attachmentUrl);
  }

  protected isImageMessage(message: ChatMessage): boolean {
    return message.type === 'Image';
  }

  protected isCounterpartyMessage(message: ChatMessage): boolean {
    return message.senderId === this.activeChat()?.counterpartyId;
  }

  protected attachmentKind(message: ChatMessage): 'pdf' | 'doc' | 'txt' | 'zip' | 'file' | 'unknown' {
    const extension = this.attachmentExtension(message);
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'doc':
      case 'docx':
        return 'doc';
      case 'txt':
        return 'txt';
      case 'zip':
        return 'zip';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'webp':
      case 'gif':
        return 'file';
      default:
        return extension ? 'unknown' : 'file';
    }
  }

  protected attachmentIconLabel(message: ChatMessage): string {
    switch (this.attachmentKind(message)) {
      case 'pdf':
        return 'PDF';
      case 'doc':
        return 'DOC';
      case 'txt':
        return 'TXT';
      case 'zip':
        return 'ZIP';
      case 'unknown':
        return '???';
      default:
        return 'FILE';
    }
  }

  protected attachmentTypeLabel(message: ChatMessage): string {
    switch (this.attachmentKind(message)) {
      case 'pdf':
        return 'PDF document';
      case 'doc':
        return 'Word document';
      case 'txt':
        return 'Text file';
      case 'zip':
        return 'Archive';
      case 'unknown':
        return 'Unknown file type';
      default:
        return 'File attachment';
    }
  }

  protected busyLabel(chat: ChatSummary): string | null {
    if (!chat.isBusy) {
      return null;
    }

    return chat.isAssignedToCurrentAdmin
      ? 'Taken by you'
      : chat.assignedAdminName
        ? `Taken by ${chat.assignedAdminName}`
        : 'Taken';
  }

  private loadPage(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      reviews: this.reviewApi.getDisputedReviews(),
      chats: this.chatApi.getMyChats(undefined, true)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reviews, chats }) => {
          this.hasUnseenDisputes.set(this.hasUnseen(this.buildDisputeSignatures(reviews)));
          this.chats.set(this.sortChats(chats.filter(chat => chat.isSupport)));
          this.refreshTabIndicator();
          this.persistSeen(this.buildChatSignatures(this.chats()));
          this.hasUnseenChats.set(false);
          this.initializeRealtime();
          this.isLoading.set(false);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load support chats.'));
          this.isLoading.set(false);
        }
      });
  }

  private loadMessages(chatId: string): void {
    this.isMessagesLoading.set(true);
    this.chatApi
      .getMessages(chatId)
      .pipe(finalize(() => this.isMessagesLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: messages => {
          this.chatMessages.set(messages);
          this.chats.update(items =>
            items.map(item => (item.id === chatId ? { ...item, unreadCount: 0 } : item))
          );
          this.persistSeen(this.buildChatSignatures(this.chats()));
          this.hasUnseenChats.set(false);
          this.joinActiveChat(chatId);
        },
        error: error => {
          this.errorMessage.set(extractApiError(error, 'Unable to load chat messages.'));
        }
      });
  }

  private initializeRealtime(): void {
    if (this.realtimeConnected) {
      return;
    }

    this.realtimeConnected = true;
    void this.chatRealtime.connect().catch(() => {
      this.realtimeConnected = false;
    });
  }

  private joinActiveChat(chatId: string): void {
    if (this.joinedChatId === chatId) {
      return;
    }

    const previousChatId = this.joinedChatId;
    this.joinedChatId = chatId;

    if (previousChatId) {
      void this.chatRealtime.leaveChat(previousChatId);
    }

    void this.chatRealtime.joinChat(chatId);
  }

  private mergeChat(chat: ChatSummary): void {
    this.chats.update(items => this.sortChats([
      ...items.filter(item => item.id !== chat.id),
      chat
    ]));
  }

  private syncSupportChats(): void {
    this.chatApi
      .getMyChats(undefined, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: chats => {
          this.chats.set(this.sortChats(chats.filter(chat => chat.isSupport)));
          this.refreshTabIndicator();
        }
      });
  }

  private sortChats(items: ChatSummary[]): ChatSummary[] {
    return [...items].sort(
      (left, right) =>
        new Date(right.lastMessageAtUtc).getTime() - new Date(left.lastMessageAtUtc).getTime()
    );
  }

  private buildChatSignatures(items: ChatSummary[]): string[] {
    return items.map(item =>
      [item.id, item.lastMessageAtUtc, item.unreadCount, item.assignedAdminId ?? 'unassigned'].join('|')
    );
  }

  private buildDisputeSignatures(items: Array<{ id: string; createdAtUtc: string; status: string }>): string[] {
    return items.map(item => [item.id, item.createdAtUtc, item.status].join('|'));
  }

  private hasUnseen(signatures: string[]): boolean {
    if (typeof window === 'undefined' || signatures.length === 0) {
      return false;
    }

    const raw = window.localStorage.getItem(this.seenStorageKey);
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

  private persistSeen(signatures: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(this.seenStorageKey, JSON.stringify(signatures));
  }

  private refreshTabIndicator(): void {
    this.hasUnseenChats.set(
      this.chats().some(chat => chat.unreadCount > 0) ||
      this.hasUnseen(this.buildChatSignatures(this.chats()))
    );
  }

  private attachmentExtension(message: ChatMessage): string | null {
    const attachmentUrl = this.attachmentUrl(message);
    if (!attachmentUrl) {
      return null;
    }

    const normalizedUrl = attachmentUrl.split('?')[0]?.split('#')[0] ?? '';
    const extension = normalizedUrl.split('.').pop()?.trim().toLowerCase();
    return extension || null;
  }
}
