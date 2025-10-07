import { EncryptionService } from './encryption';

// Browser-compatible encrypted file storage using localStorage
export interface EncryptedFileMetadata {
  id: string;
  userId: string;
  name: string;
  type: 'document' | 'image' | 'folder';
  path: string;
  size?: number;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  encryptedPath: string; // Storage key identifier
}

export class EncryptedFileStorage {
  private static readonly STORAGE_PREFIX = 'lora_encrypted_files_';
  private static readonly METADATA_PREFIX = 'lora_file_metadata_';

  /**
   * Generate a unique file ID
   */
  private static generateFileId(): string {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Save a file with encryption to localStorage
   */
  static async saveFile(
    userId: string,
    fileId: string,
    fileBuffer: ArrayBuffer,
    password: string,
    metadata: Omit<EncryptedFileMetadata, 'encryptedPath'>
  ): Promise<EncryptedFileMetadata> {
    try {
      // Convert ArrayBuffer to base64 string in chunks to avoid stack overflow
      const uint8Array = new Uint8Array(fileBuffer);
      let binaryString = '';
      const chunkSize = 8192; // Process in 8KB chunks

      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binaryString += String.fromCharCode(...Array.from(chunk));
      }

      const base64Data = btoa(binaryString);

      // Encrypt the file data
      const encryptedData = await EncryptionService.encrypt(base64Data, password);

      // Generate storage key
      const storageKey = this.STORAGE_PREFIX + fileId;
      const metadataKey = this.METADATA_PREFIX + fileId;

      // Store encrypted data
      localStorage.setItem(storageKey, encryptedData);

      // Store metadata
      const fullMetadata: EncryptedFileMetadata = {
        ...metadata,
        encryptedPath: fileId // Use fileId as the path identifier
      };
      localStorage.setItem(metadataKey, JSON.stringify(fullMetadata));

      return fullMetadata;
    } catch (error) {
      console.error('Failed to save encrypted file:', error);
      throw new Error('Failed to save file securely');
    }
  }

  /**
   * Load and decrypt a file from localStorage
   */
  static async loadFile(
    encryptedPath: string,
    password: string
  ): Promise<ArrayBuffer> {
    try {
      const storageKey = this.STORAGE_PREFIX + encryptedPath;
      const encryptedData = localStorage.getItem(storageKey);

      if (!encryptedData) {
        throw new Error('File not found');
      }

      // Decrypt the data
      const decryptedBase64 = await EncryptionService.decrypt(encryptedData, password);

      // Convert back to ArrayBuffer in chunks to avoid stack overflow
      const binaryString = atob(decryptedBase64);
      const bytes = new Uint8Array(binaryString.length);
      const chunkSize = 8192; // Process in 8KB chunks

      for (let i = 0; i < binaryString.length; i += chunkSize) {
        const chunk = binaryString.slice(i, i + chunkSize);
        for (let j = 0; j < chunk.length; j++) {
          bytes[i + j] = chunk.charCodeAt(j);
        }
      }

      return bytes.buffer;
    } catch (error) {
      console.error('Failed to load encrypted file:', error);
      throw new Error('Failed to load file - invalid password or corrupted data');
    }
  }

  /**
   * Delete an encrypted file from localStorage
   */
  static async deleteFile(encryptedPath: string): Promise<void> {
    try {
      const storageKey = this.STORAGE_PREFIX + encryptedPath;
      const metadataKey = this.METADATA_PREFIX + encryptedPath;

      localStorage.removeItem(storageKey);
      localStorage.removeItem(metadataKey);
    } catch (error) {
      console.warn('Failed to delete encrypted file:', error);
    }
  }

  /**
   * Check if a file exists in localStorage
   */
  static async fileExists(encryptedPath: string): Promise<boolean> {
    const storageKey = this.STORAGE_PREFIX + encryptedPath;
    return localStorage.getItem(storageKey) !== null;
  }

  /**
   * Get file metadata from localStorage
   */
  static getFileMetadata(encryptedPath: string): EncryptedFileMetadata | null {
    try {
      const metadataKey = this.METADATA_PREFIX + encryptedPath;
      const metadataJson = localStorage.getItem(metadataKey);
      return metadataJson ? JSON.parse(metadataJson) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get all files for a user from localStorage
   */
  static getUserFiles(userId: string): EncryptedFileMetadata[] {
    const files: EncryptedFileMetadata[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.METADATA_PREFIX)) {
        try {
          const metadata: EncryptedFileMetadata = JSON.parse(localStorage.getItem(key)!);
          if (metadata.userId === userId) {
            files.push(metadata);
          }
        } catch {
          // Skip invalid metadata
        }
      }
    }

    return files.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get total storage usage for a user
   */
  static async getUserStorageUsage(userId: string): Promise<number> {
    const userFiles = this.getUserFiles(userId);
    let totalSize = 0;

    for (const file of userFiles) {
      if (file.size) {
        totalSize += file.size;
      }
    }

    return totalSize;
  }

  /**
   * Clean up orphaned encrypted files
   */
  static cleanupOrphanedFiles(): void {
    const metadataKeys = new Set<string>();
    const storageKeys = new Set<string>();

    // Collect all keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (key.startsWith(this.METADATA_PREFIX)) {
          metadataKeys.add(key);
        } else if (key.startsWith(this.STORAGE_PREFIX)) {
          storageKeys.add(key);
        }
      }
    }

    // Find orphaned storage keys (storage without metadata)
    for (const storageKey of Array.from(storageKeys)) {
      const fileId = storageKey.replace(this.STORAGE_PREFIX, '');
      const metadataKey = this.METADATA_PREFIX + fileId;

      if (!metadataKeys.has(metadataKey)) {
        localStorage.removeItem(storageKey);
        console.log(`Cleaned up orphaned file: ${fileId}`);
      }
    }
  }
}