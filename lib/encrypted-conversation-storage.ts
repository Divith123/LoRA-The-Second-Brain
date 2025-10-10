import { EncryptionService } from './encryption';
import { ProviderType } from './model-types';

// Browser-compatible encrypted conversation storage using localStorage
export interface EncryptedConversationData {
  id: string;
  userId: string;
  title: string;
  messages: any[]; // CoreMessage[] from ai package
  model: string;
  provider?: ProviderType;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  projectId?: string; // Associated project ID
  encryptedPath: string; // Storage key identifier
}

export class EncryptedConversationStorage {
  private static readonly STORAGE_PREFIX = 'lora_encrypted_conversations_';
  private static readonly METADATA_PREFIX = 'lora_conversation_metadata_';

  /**
   * Generate a unique conversation ID
   */
  private static generateConversationId(): string {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Save conversation data with encryption to localStorage
   */
  static async saveConversation(
    userId: string,
    conversationId: string,
    conversationData: Omit<EncryptedConversationData, 'encryptedPath'>,
    password: string
  ): Promise<EncryptedConversationData> {
    try {
      // Convert conversation data to JSON string
      const jsonData = JSON.stringify(conversationData);

      // Encrypt the conversation data
      const encryptedData = await EncryptionService.encrypt(jsonData, password);

      // Generate storage key
      const storageKey = this.STORAGE_PREFIX + conversationId;
      const metadataKey = this.METADATA_PREFIX + conversationId;

      // Store encrypted data
      localStorage.setItem(storageKey, encryptedData);

      // Store metadata
      const fullMetadata: EncryptedConversationData = {
        ...conversationData,
        encryptedPath: conversationId // Use conversationId as the path identifier
      };
      localStorage.setItem(metadataKey, JSON.stringify(fullMetadata));

      return fullMetadata;
    } catch (error) {
      console.error('Failed to save encrypted conversation:', error);
      throw new Error('Failed to save conversation securely');
    }
  }

  /**
   * Load and decrypt conversation data from localStorage
   */
  static async loadConversation(
    encryptedPath: string,
    password: string
  ): Promise<EncryptedConversationData> {
    try {
      const storageKey = this.STORAGE_PREFIX + encryptedPath;
      const encryptedData = localStorage.getItem(storageKey);

      if (!encryptedData) {
        throw new Error('Conversation not found');
      }

      // Decrypt the data
      const decryptedJson = await EncryptionService.decrypt(encryptedData, password);

      // Parse back to conversation data
      return JSON.parse(decryptedJson);
    } catch (error) {
      console.error('Failed to load encrypted conversation:', error);
      throw new Error('Failed to load conversation - invalid password or corrupted data');
    }
  }

  /**
   * Update conversation data (re-encrypt with new data)
   */
  static async updateConversation(
    encryptedPath: string,
    updatedData: Partial<EncryptedConversationData>,
    password: string
  ): Promise<EncryptedConversationData> {
    try {
      // Load existing conversation
      const existingConversation = await this.loadConversation(encryptedPath, password);

      // Merge with updates
      const updatedConversation = {
        ...existingConversation,
        ...updatedData,
        updatedAt: new Date().toISOString()
      };

      // Delete old encrypted file
      await this.deleteConversation(encryptedPath);

      // Save updated conversation with new encryption
      const newEncryptedFilename = this.generateConversationId();
      const newStorageKey = this.STORAGE_PREFIX + newEncryptedFilename;
      const newMetadataKey = this.METADATA_PREFIX + newEncryptedFilename;

      const jsonData = JSON.stringify(updatedConversation);
      const encryptedData = await EncryptionService.encrypt(jsonData, password);

      localStorage.setItem(newStorageKey, encryptedData);
      localStorage.setItem(newMetadataKey, JSON.stringify({
        ...updatedConversation,
        encryptedPath: newEncryptedFilename
      }));

      return {
        ...updatedConversation,
        encryptedPath: newEncryptedFilename
      };
    } catch (error) {
      console.error('Failed to update encrypted conversation:', error);
      throw new Error('Failed to update conversation securely');
    }
  }

  /**
   * Delete an encrypted conversation from localStorage
   */
  static async deleteConversation(encryptedPath: string): Promise<void> {
    try {
      const storageKey = this.STORAGE_PREFIX + encryptedPath;
      const metadataKey = this.METADATA_PREFIX + encryptedPath;

      localStorage.removeItem(storageKey);
      localStorage.removeItem(metadataKey);
    } catch (error) {
      console.warn('Failed to delete encrypted conversation:', error);
    }
  }

  /**
   * Check if a conversation exists in localStorage
   */
  static async conversationExists(encryptedPath: string): Promise<boolean> {
    const storageKey = this.STORAGE_PREFIX + encryptedPath;
    return localStorage.getItem(storageKey) !== null;
  }

  /**
   * Get conversation metadata from localStorage
   */
  static getConversationMetadata(encryptedPath: string): EncryptedConversationData | null {
    try {
      const metadataKey = this.METADATA_PREFIX + encryptedPath;
      const metadataJson = localStorage.getItem(metadataKey);
      return metadataJson ? JSON.parse(metadataJson) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get all conversations for a user from localStorage
   */
  static getUserConversations(userId: string): EncryptedConversationData[] {
    const conversations: EncryptedConversationData[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.METADATA_PREFIX)) {
        try {
          const metadata: EncryptedConversationData = JSON.parse(localStorage.getItem(key)!);
          if (metadata.userId === userId) {
            conversations.push(metadata);
          }
        } catch {
          // Skip invalid metadata
        }
      }
    }

    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get total conversation storage usage for a user
   */
  static async getUserConversationStorageUsage(userId: string): Promise<number> {
    const userConversations = this.getUserConversations(userId);
    let totalSize = 0;

    for (const conversation of userConversations) {
      // Estimate size based on JSON string length
      const jsonSize = JSON.stringify(conversation).length;
      totalSize += jsonSize;
    }

    return totalSize;
  }

  /**
   * Export conversations for knowledge base (decrypts and formats)
   */
  static async exportConversationsForKnowledgeBase(
    userId: string,
    conversationIds: string[],
    password: string
  ): Promise<string> {
    try {
      // Get conversation metadata from database
      const conversations = await Promise.all(
        conversationIds.map(async (id) => {
          // This would need to be implemented to get the encrypted path from database
          // For now, return empty - this needs database integration
          return null;
        })
      );

      // Filter out nulls and decrypt conversations
      const validConversations = conversations.filter(conv => conv !== null) as EncryptedConversationData[];

      // Format conversations for knowledge base
      const knowledgeBaseData = validConversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        pinned: conv.pinned,
        messages: conv.messages.map((msg: any, index: number) => ({
          index,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(conv.createdAt).toISOString()
        }))
      }));

      return JSON.stringify(knowledgeBaseData, null, 2);
    } catch (error) {
      console.error('Failed to export conversations for knowledge base:', error);
      throw new Error('Failed to export conversations securely');
    }
  }
}