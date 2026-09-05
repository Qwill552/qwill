export interface AttachmentSelectionItem {
  messageId: number;
  senderId: string | null;
}

export interface AttachmentSelectionBinding {
  active: boolean;
  selectedIds: ReadonlySet<number>;
  pendingRemoval: ReadonlySet<number> | null;
  onLongPress: (item: AttachmentSelectionItem) => void;
  onTap: (item: AttachmentSelectionItem) => void;
}
