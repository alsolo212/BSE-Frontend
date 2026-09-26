export type MessageType = 'Text' | 'Image' | 'File';

export interface ChatSummary {
  id: string;
  listingId?: string | null;
  listingTitle?: string | null;
  listingPrimaryImageUrl?: string | null;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyAvatarUrl?: string | null;
  isSellerView: boolean;
  isSupport: boolean;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  isBusy: boolean;
  isAssignedToCurrentAdmin: boolean;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAtUtc: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  attachmentUrl?: string | null;
  sentAtUtc: string;
  readAtUtc?: string | null;
}

export interface ChatAttachmentUploadResponse {
  fileName: string;
  attachmentUrl: string;
  type: MessageType;
}

export interface StartChatRequest {
  listingId: string;
}

export interface StartSupportChatResponse {
  chat: ChatSummary;
}

export interface SendMessageRequest {
  content: string;
  type?: MessageType;
  attachmentUrl?: string | null;
}
