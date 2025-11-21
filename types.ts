export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface ScreenFolder {
  name: string;
  path: string;
  screenId: number; // Extracted from "Экран 1" -> 1
}

export interface MediaFile {
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
}

export enum ModerationStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface ModerationResult {
  safe: boolean;
  reason: string;
}