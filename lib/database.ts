import Dexie, { Table } from 'dexie';
import { EncryptedFileStorage, EncryptedFileMetadata } from './encrypted-file-storage';
import { EncryptedProjectStorage, EncryptedProjectData } from './encrypted-project-storage';
import { EncryptedConversationStorage, EncryptedConversationData } from './encrypted-conversation-storage';
import { EncryptionService } from './encryption';
import { ProviderType } from './model-types';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
  createdAt: string;
  avatar?: string; // File ID of the avatar file
  // API Keys for different services
  groqApiKey?: string;
  elevenlabsApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
}

export interface Conversation extends EncryptedConversationData {
  // Inherits all properties from EncryptedConversationData
}

export interface FileItem extends EncryptedFileMetadata {
  // Inherits all properties from EncryptedFileMetadata
}

export interface Project extends EncryptedProjectData {
  // Inherits all properties from EncryptedProjectData
}

export class LoRADatabase extends Dexie {
  users!: Table<User>;
  conversations!: Table<Conversation>;
  files!: Table<FileItem>;
  projects!: Table<Project>;

  constructor() {
    super('LoRADatabase');

    this.version(1).stores({
      users: 'id, name, createdAt',
      conversations: 'id, userId, title, createdAt, updatedAt'
    });

    this.version(2).stores({
      users: 'id, name, createdAt',
      conversations: 'id, userId, title, createdAt, updatedAt, pinned'
    });

    this.version(5).stores({
      users: 'id, name, createdAt, securityQuestion',
      conversations: 'id, userId, title, createdAt, updatedAt, pinned, provider',
      files: 'id, userId, name, type, path, parentId, createdAt, updatedAt',
      projects: 'id, userId, name, category, createdAt, updatedAt'
    });

    this.version(6).stores({
      users: 'id, name, email, createdAt, securityQuestion',
      conversations: 'id, userId, title, createdAt, updatedAt, pinned, provider',
      files: 'id, userId, name, type, path, parentId, createdAt, updatedAt',
      projects: 'id, userId, name, category, createdAt, updatedAt'
    });

    this.version(9).stores({
      users: 'id, name, email, createdAt, securityQuestion, groqApiKey, elevenlabsApiKey, openaiApiKey, openrouterApiKey, geminiApiKey, avatar',
      conversations: 'id, userId, title, createdAt, updatedAt, pinned, provider, projectId',
      files: 'id, userId, name, type, path, parentId, createdAt, updatedAt',
      projects: 'id, userId, name, category, createdAt, updatedAt'
    });

    // Add debugging
    this.open().then(async () => {
      console.log('LoRA Database opened successfully, version:', this.verno);
      // Run migration to fix user data
      await DatabaseService.migrateUserData();
    }).catch(error => {
      console.error('Failed to open LoRA Database:', error);
    });
  }
}

// Lazy initialization of database - only create when needed
let dbInstance: LoRADatabase | null = null;

function getDatabase(): LoRADatabase {
  // Check if we're in a browser environment with IndexedDB support
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('Database operations are only available in browser environment with IndexedDB support');
  }

  if (!dbInstance) {
    dbInstance = new LoRADatabase();
  }
  return dbInstance;
}

// Export a function that returns the database - this ensures lazy loading
export function getDb(): LoRADatabase {
  return getDatabase();
}

// For backward compatibility, export a proxy that throws during SSR
export const db = new Proxy({} as LoRADatabase, {
  get(target, prop) {
    // Only access database in browser environment
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('Database operations are only available in browser environment with IndexedDB support');
    }

    const database = getDatabase();
    const value = (database as any)[prop];
    return typeof value === 'function'
      ? value.bind(database)
      : value;
  }
});

// Database operations
export class DatabaseService {
  // Helper to check if we're in a browser environment
  private static checkBrowserEnvironment(): void {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('Database operations are only available in browser environment with IndexedDB support');
    }
  }

  // Helper to get database instance safely
  private static getDatabase(): LoRADatabase {
    this.checkBrowserEnvironment();
    if (!dbInstance) {
      dbInstance = new LoRADatabase();
    }
    return dbInstance;
  }
  // Password validation
  static validatePasswordStrength(password: string): boolean {
    // Minimum requirements for maximum security
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const hasNoCommonWords = !/(password|123456|qwerty|admin|user|login)/i.test(password);

    return password.length >= minLength &&
           hasUpperCase &&
           hasLowerCase &&
           hasNumbers &&
           hasSpecialChars &&
           hasNoCommonWords;
  }

  static async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    try {
      const user = await this.getDatabase().users.get(userId);
      if (!user) return false;

      return await EncryptionService.verifyPassword(password, user.password);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static async verifyUserPasswordByName(name: string, password: string): Promise<User | null> {
    try {
      const user = await this.getDatabase().users.where('name').equalsIgnoreCase(name).first();
      if (!user) return null;

      const isValidPassword = await EncryptionService.verifyPassword(password, user.password);
      return isValidPassword ? user : null;
    } catch (error) {
      console.error('Error verifying password by name:', error);
      return null;
    }
  }

  static async verifyUserPasswordByEmail(email: string, password: string): Promise<User | null> {
    try {
      const user = await this.getDatabase().users.where('email').equalsIgnoreCase(email).first();
      if (!user) return null;

      const isValidPassword = await EncryptionService.verifyPassword(password, user.password);
      return isValidPassword ? user : null;
    } catch (error) {
      console.error('Error verifying password by email:', error);
      return null;
    }
  }
  static async deleteUserByPassword(userId: string, password: string): Promise<boolean> {
    try {
      // Verify password before allowing deletion
      const isValidPassword = await this.verifyUserPassword(userId, password);
      if (!isValidPassword) {
        return false;
      }

      // Delete all associated data first
      await this.clearUserData(userId);

      // Delete the user
      await this.getDatabase().users.delete(userId);
      return true;
    } catch (error) {
      console.error('Error deleting user by password:', error);
      return false;
    }
  }

  static async clearUserData(userId: string): Promise<void> {
    try {
      // Delete all conversations and their encrypted data
      const conversations = await this.getDatabase().conversations.where('userId').equals(userId).toArray();
      for (const conversation of conversations) {
        if (conversation.encryptedPath) {
          await EncryptedConversationStorage.deleteConversation(conversation.encryptedPath);
        }
      }
      await this.getDatabase().conversations.where('userId').equals(userId).delete();

      // Delete all files and their encrypted data
      const files = await this.getDatabase().files.where('userId').equals(userId).toArray();
      for (const file of files) {
        if (file.encryptedPath) {
          await EncryptedFileStorage.deleteFile(file.encryptedPath);
        }
      }
      await this.getDatabase().files.where('userId').equals(userId).delete();

      // Delete all projects and their encrypted data
      const projects = await this.getDatabase().projects.where('userId').equals(userId).toArray();
      for (const project of projects) {
        if (project.encryptedPath) {
          await EncryptedProjectStorage.deleteProject(project.encryptedPath);
        }
      }
      await this.getDatabase().projects.where('userId').equals(userId).delete();
    } catch (error) {
      console.error('Error clearing user data:', error);
    }
  }

  // User operations
  static async createUser(name: string, email: string, password: string, securityQuestion: string, securityAnswer: string): Promise<User | null> {
    this.checkBrowserEnvironment();
    try {
      const existingUser = await this.getDatabase().users.where('name').equalsIgnoreCase(name).first();
      if (existingUser) {
        return null; // User already exists
      }

      // Validate password strength
      if (!this.validatePasswordStrength(password)) {
        throw new Error('Password does not meet security requirements');
      }

      // Hash the password and security answer before storing
      const hashedPassword = await EncryptionService.hashPassword(password);
      const hashedSecurityAnswer = await EncryptionService.hashPassword(securityAnswer.toLowerCase().trim());

      const user: User = {
        id: Date.now().toString(),
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword, // Store hashed password
        securityQuestion: securityQuestion.trim(),
        securityAnswer: hashedSecurityAnswer, // Store hashed security answer
        createdAt: new Date().toISOString()
      };

      await this.getDatabase().users.add(user);
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  }

  static async getAllUsers(): Promise<User[]> {
    this.checkBrowserEnvironment();
    try {
      return await this.getDatabase().users.toArray();
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  static async migrateUserData(): Promise<void> {
    this.checkBrowserEnvironment();
    try {
      const users = await this.getDatabase().users.toArray();
      let migratedCount = 0;

      for (const user of users) {
        let needsUpdate = false;
        const updates: Partial<User> = {};

        // If name contains email and email field is empty or doesn't match, migrate
        if (user.name && user.name.includes('@') && (!user.email || user.email !== user.name)) {
          const email = user.name;
          const name = email.split('@')[0];
          updates.name = name;
          updates.email = email;
          needsUpdate = true;
          console.log(`Migrating user ${user.id}: name "${user.name}" -> name "${name}", email "${email}"`);
        } else if (user.email === undefined) {
          // Ensure email field exists (for users created before email field was added)
          updates.email = '';
          needsUpdate = true;
        }

        if (needsUpdate) {
          await this.getDatabase().users.update(user.id, updates);
          migratedCount++;
        }
      }

      if (migratedCount > 0) {
        console.log(`Migrated ${migratedCount} user records to separate name and email fields`);
      } else {
        console.log('No user records needed migration');
      }
    } catch (error) {
      console.error('Error migrating user data:', error);
    }
  }

  static async getUserById(id: string): Promise<User | undefined> {
    this.checkBrowserEnvironment();
    try {
      return await this.getDatabase().users.get(id);
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  static async getUserByName(name: string): Promise<User | undefined> {
    try {
      return await this.getDatabase().users.where('name').equalsIgnoreCase(name).first();
    } catch (error) {
      console.error('Error getting user by name:', error);
      return undefined;
    }
  }

  static async updateUserApiKeys(userId: string, apiKeys: {
    groqApiKey?: string;
    elevenlabsApiKey?: string;
    openaiApiKey?: string;
    openrouterApiKey?: string;
    geminiApiKey?: string;
  }): Promise<void> {
    try {
      await this.getDatabase().users.update(userId, apiKeys);
    } catch (error) {
      console.error('Error updating user API keys:', error);
    }
  }

  static async getUserApiKeys(userId: string): Promise<{
    groqApiKey?: string;
    elevenlabsApiKey?: string;
    openaiApiKey?: string;
    openrouterApiKey?: string;
    geminiApiKey?: string;
  } | null> {
    try {
      const user = await this.getDatabase().users.get(userId);
      if (!user) return null;

      return {
        groqApiKey: user.groqApiKey || '',
        elevenlabsApiKey: user.elevenlabsApiKey || '',
        openaiApiKey: user.openaiApiKey || '',
        geminiApiKey: user.geminiApiKey || '',
        openrouterApiKey: user.openrouterApiKey || ''
      };
    } catch (error) {
      console.error('Error getting user API keys:', error);
      return null;
    }
  }

  static async updateUserAvatar(userId: string, avatarFile: File, password: string): Promise<boolean> {
    try {
      // Delete existing avatar first
      const existingUser = await this.getDatabase().users.get(userId);
      if (existingUser?.avatar) {
        await this.deleteFile(existingUser.avatar);
      }

      // Read the file as ArrayBuffer
      const fileBuffer = await avatarFile.arrayBuffer();
      
      // Create encrypted file entry for the avatar
      const avatarFileEntry = await this.createFile(
        userId,
        `avatar_${userId}_${Date.now()}.jpg`,
        'image',
        `/avatars/${userId}`,
        avatarFile.size,
        undefined,
        fileBuffer,
        password
      );

      if (!avatarFileEntry) {
        return false;
      }

      // Update user with avatar file ID (not encrypted path)
      await this.getDatabase().users.update(userId, { avatar: avatarFileEntry.id });
      return true;
    } catch (error) {
      console.error('Error updating user avatar:', error);
      return false;
    }
  }

  static async getUserAvatar(userId: string, password: string): Promise<string | null> {
    try {
      const user = await this.getDatabase().users.get(userId);
      if (!user || !user.avatar) {
        return null;
      }

      // Load the avatar file content using the file ID
      const avatarBuffer = await this.loadFileContent(user.avatar, password);
      if (!avatarBuffer) {
        return null;
      }

      // Convert to data URL
      const blob = new Blob([avatarBuffer], { type: 'image/jpeg' });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error getting user avatar:', error);
      return null;
    }
  }

  static async deleteUserAvatar(userId: string): Promise<boolean> {
    try {
      const user = await this.getDatabase().users.get(userId);
      if (!user || !user.avatar) {
        return true; // No avatar to delete
      }

      // Delete the avatar file using the file ID
      await this.deleteFile(user.avatar);

      // Update user to remove avatar reference
      await this.getDatabase().users.update(userId, { avatar: undefined });
      return true;
    } catch (error) {
      console.error('Error deleting user avatar:', error);
      return false;
    }
  }

  static async verifySecurityAnswer(name: string, securityAnswer: string): Promise<User | null> {
    try {
      const user = await this.getDatabase().users.where('name').equalsIgnoreCase(name).first();
      if (!user) return null;

      const hashedAnswer = await EncryptionService.hashPassword(securityAnswer.toLowerCase().trim());
      const isValidAnswer = hashedAnswer === user.securityAnswer;
      return isValidAnswer ? user : null;
    } catch (error) {
      console.error('Error verifying security answer:', error);
      return null;
    }
  }

  static async resetPassword(name: string, securityAnswer: string, newPassword: string): Promise<boolean> {
    try {
      // First verify the security answer
      const user = await this.verifySecurityAnswer(name, securityAnswer);
      if (!user) return false;

      // Validate new password strength
      if (!this.validatePasswordStrength(newPassword)) {
        throw new Error('New password does not meet security requirements');
      }

      // Hash the new password
      const hashedPassword = await EncryptionService.hashPassword(newPassword);

      // Update the user's password
      await this.getDatabase().users.update(user.id, { password: hashedPassword });
      return true;
    } catch (error) {
      console.error('Error resetting password:', error);
      return false;
    }
  }

  // Conversation operations with encryption
  static async createConversation(
    userId: string,
    title: string,
    messages: any[],
    model: string,
    pinned: boolean = false,
    password?: string,
    provider?: ProviderType
  ): Promise<Conversation | null> {
    try {
      const conversationId = Date.now().toString();
      const now = new Date().toISOString();

      const conversationData = {
        id: conversationId,
        userId,
        title,
        messages,
        model,
        provider,
        pinned,
        createdAt: now,
        updatedAt: now
      };

      let encryptedPath = '';

      // Encrypt and store conversation data if password provided
      if (password) {
        const encryptedConversation = await EncryptedConversationStorage.saveConversation(
          userId,
          conversationId,
          conversationData,
          password
        );
        encryptedPath = encryptedConversation.encryptedPath;
      }

      // When encrypted, don't store messages in the database to avoid sync issues
      const conversation: Conversation = {
        id: conversationId,
        userId,
        title,
        messages: password ? [] : messages, // Clear messages if encrypted
        model,
        provider,
        pinned,
        createdAt: now,
        updatedAt: now,
        encryptedPath
      };

      await this.getDatabase().conversations.add(conversation);
      return conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }

  static async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    this.checkBrowserEnvironment();
    try {
      return await this.getDatabase().conversations.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  static async getConversationById(id: string): Promise<Conversation | undefined> {
    try {
      return await this.getDatabase().conversations.get(id);
    } catch (error) {
      console.error('Error getting conversation:', error);
      return undefined;
    }
  }

  static async updateConversation(id: string, updates: Partial<Conversation>, password?: string): Promise<void> {
    try {
      const existingConversation = await this.getDatabase().conversations.get(id);
      if (!existingConversation) return;

      // If password provided and conversation has encrypted data, update encrypted storage
      // and persist the new encryptedPath returned by the storage layer.
      let updatedEncryptedPath: string | undefined = undefined;
      if (password && existingConversation.encryptedPath) {
        try {
          const updatedEncrypted = await EncryptedConversationStorage.updateConversation(
            existingConversation.encryptedPath,
            updates,
            password
          );
          updatedEncryptedPath = updatedEncrypted.encryptedPath;
        } catch (err) {
          console.error('Failed to update encrypted conversation storage:', err);
          // Fallthrough to still update DB fields (without changing encryptedPath)
        }
      }

      const dbUpdates: any = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // When encrypted, don't store messages in the database to avoid sync issues
      if (password && existingConversation.encryptedPath && updates.messages) {
        dbUpdates.messages = []; // Clear messages if encrypted
      }

      if (updatedEncryptedPath) {
        dbUpdates.encryptedPath = updatedEncryptedPath;
      }

      await this.getDatabase().conversations.update(id, dbUpdates);
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }

  static async deleteConversation(id: string, password?: string): Promise<void> {
    try {
      const conversation = await this.getDatabase().conversations.get(id);
      if (conversation?.encryptedPath) {
        // Delete the encrypted conversation from storage
        await EncryptedConversationStorage.deleteConversation(conversation.encryptedPath);
      }

      await this.getDatabase().conversations.delete(id);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }

  // Utility methods
  static async clearAllData(): Promise<void> {
    try {
      await this.getDatabase().users.clear();
      await this.getDatabase().conversations.clear();
      await this.getDatabase().files.clear();
      await this.getDatabase().projects.clear();
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }

  static async exportData(): Promise<{ users: User[], conversations: Conversation[] }> {
    try {
      const users = await this.getDatabase().users.toArray();
      const conversations = await this.getDatabase().conversations.toArray();
      return { users, conversations };
    } catch (error) {
      console.error('Error exporting data:', error);
      return { users: [], conversations: [] };
    }
  }

  static async exportConversationsForKnowledgeBase(userId: string, password?: string): Promise<string> {
    try {
      const conversations = await this.getDatabase().conversations.where('userId').equals(userId).toArray();

      // If password provided, decrypt conversations from encrypted storage
      if (password) {
        const decryptedConversations = await Promise.all(
          conversations.map(async (conv) => {
            if (conv.encryptedPath) {
              try {
                return await EncryptedConversationStorage.loadConversation(conv.encryptedPath, password);
              } catch (error) {
                console.warn(`Failed to decrypt conversation ${conv.id}:`, error);
                return null;
              }
            }
            return conv;
          })
        );

        // Filter out failed decryptions
        const validConversations = decryptedConversations.filter(conv => conv !== null) as Conversation[];

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
      } else {
        // Fallback to unencrypted conversations (for backward compatibility)
        const knowledgeBaseData = conversations.map(conv => ({
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
      }
    } catch (error) {
      console.error('Error exporting conversations for knowledge base:', error);
      return '';
    }
  }

  static async retrieveRelevantConversationHistory(
    userId: string,
    query: string,
    currentConversationId: string | undefined,
    password?: string,
    maxResults: number = 3
  ): Promise<string> {
    try {
      // Get all conversations for the user
      const conversations = await this.getDatabase().conversations.where('userId').equals(userId).toArray();

      // If password provided, decrypt conversations from encrypted storage
      let validConversations: Conversation[] = [];
      if (password) {
        const decryptedConversations = await Promise.all(
          conversations.map(async (conv) => {
            if (conv.encryptedPath) {
              try {
                return await EncryptedConversationStorage.loadConversation(conv.encryptedPath, password);
              } catch (error) {
                console.warn(`Failed to decrypt conversation ${conv.id}:`, error);
                return null;
              }
            }
            return conv;
          })
        );
        validConversations = decryptedConversations.filter(conv => conv !== null) as Conversation[];
      } else {
        // Use unencrypted conversations
        validConversations = conversations.filter(conv => conv.messages && conv.messages.length > 0);
      }

      // Filter out current conversation and empty conversations
      validConversations = validConversations.filter(conv =>
        conv.id !== currentConversationId && conv.messages && conv.messages.length > 0
      );

      // Simple relevance scoring based on text matching
      const scoredConversations = validConversations.map(conv => {
        const conversationText = conv.messages.map((msg: any) =>
          typeof msg.content === 'string' ? msg.content : ''
        ).join(' ').toLowerCase();

        const queryLower = query.toLowerCase();
        let score = 0;

        // Simple keyword matching
        const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
        for (const word of queryWords) {
          if (conversationText.includes(word)) {
            score += 1;
          }
        }

        // Boost score for conversations with more messages (indicating depth)
        score += Math.min(conv.messages.length / 10, 2);

        // Boost score for recent conversations
        const daysSinceUpdate = (Date.now() - new Date(conv.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 1 - daysSinceUpdate / 30); // Boost for conversations updated within last 30 days

        return { conversation: conv, score };
      });

      // Sort by score and take top results
      scoredConversations.sort((a, b) => b.score - a.score);
      const topConversations = scoredConversations.slice(0, maxResults);

      // Format the relevant conversation history
      const historyParts: string[] = [];
      for (const { conversation } of topConversations) {
        const messages = conversation.messages.slice(-6); // Last 6 messages to keep context manageable
        const formattedMessages = messages.map((msg: any, idx: number) => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          return `${role}: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
        }).join('\n');

        historyParts.push(`Conversation: ${conversation.title}\nDate: ${new Date(conversation.updatedAt).toLocaleDateString()}\n${formattedMessages}`);
      }

      return historyParts.join('\n\n---\n\n');
    } catch (error) {
      console.error('Error retrieving relevant conversation history:', error);
      return '';
    }
  }

  // File operations with encryption
  static async createFile(
    userId: string,
    name: string,
    type: 'document' | 'image' | 'folder',
    path: string,
    size?: number,
    parentId?: string,
    fileBuffer?: ArrayBuffer,
    password?: string
  ): Promise<FileItem | null> {
    try {
      const fileId = Date.now().toString();
      const now = new Date().toISOString();

      let encryptedPath = '';

      // For files with content, encrypt and store
      if (type !== 'folder' && fileBuffer && password) {
        const metadata = {
          id: fileId,
          userId,
          name,
          type,
          path,
          size,
          parentId,
          createdAt: now,
          updatedAt: now
        };

        const encryptedFile = await EncryptedFileStorage.saveFile(
          userId,
          fileId,
          fileBuffer,
          password,
          metadata
        );
        encryptedPath = encryptedFile.encryptedPath;
      }

      const file: FileItem = {
        id: fileId,
        userId,
        name,
        type,
        path,
        size,
        parentId,
        createdAt: now,
        updatedAt: now,
        encryptedPath
      };

      await this.getDatabase().files.add(file);
      return file;
    } catch (error) {
      console.error('Error creating file:', error);
      return null;
    }
  }

  static async getFilesByUserId(userId: string): Promise<FileItem[]> {
    this.checkBrowserEnvironment();
    try {
      return await this.getDatabase().files.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting files:', error);
      return [];
    }
  }

  static async updateFile(id: string, updates: Partial<FileItem>): Promise<void> {
    try {
      await this.getDatabase().files.update(id, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating file:', error);
    }
  }

  static async loadFileContent(fileId: string, password: string): Promise<ArrayBuffer | null> {
    try {
      const file = await this.getDatabase().files.get(fileId);
      if (!file || !file.encryptedPath) {
        return null;
      }

      return await EncryptedFileStorage.loadFile(file.encryptedPath, password);
    } catch (error) {
      console.error('Error loading file content:', error);
      return null;
    }
  }

  static async deleteFile(id: string): Promise<void> {
    try {
      const file = await this.getDatabase().files.get(id);
      if (file?.encryptedPath) {
        // Delete the encrypted file from disk
        await EncryptedFileStorage.deleteFile(file.encryptedPath);
      }

      await this.getDatabase().files.delete(id);
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  // Project operations with encryption
  static async createProject(
    userId: string,
    name: string,
    description: string,
    category: string,
    color?: string,
    password?: string
  ): Promise<Project | null> {
    try {
      const projectId = Date.now().toString();
      const now = new Date().toISOString();

      const projectData = {
        id: projectId,
        userId,
        name,
        description,
        category,
        color,
        createdAt: now,
        updatedAt: now
      };

      let encryptedPath = '';

      // Encrypt and store project data if password provided
      if (password) {
        const encryptedProject = await EncryptedProjectStorage.saveProject(
          userId,
          projectId,
          projectData,
          password
        );
        encryptedPath = encryptedProject.encryptedPath;
      }

      const project: Project = {
        ...projectData,
        encryptedPath
      };

      await this.getDatabase().projects.add(project);
      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      return null;
    }
  }

  static async getProjectsByUserId(userId: string): Promise<Project[]> {
    this.checkBrowserEnvironment();
    try {
      return await this.getDatabase().projects.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting projects:', error);
      return [];
    }
  }

  static async updateProject(id: string, updates: Partial<Project>, password?: string): Promise<void> {
    try {
      const existingProject = await this.getDatabase().projects.get(id);
      if (!existingProject) return;

      // If password provided and project has encrypted data, update encrypted storage
      if (password && existingProject.encryptedPath) {
        await EncryptedProjectStorage.updateProject(
          existingProject.encryptedPath,
          updates,
          password
        );
      }

      await this.getDatabase().projects.update(id, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating project:', error);
    }
  }

  static async deleteProject(id: string): Promise<void> {
    try {
      const project = await this.getDatabase().projects.get(id);
      if (project?.encryptedPath) {
        // Delete the encrypted project from disk
        await EncryptedProjectStorage.deleteProject(project.encryptedPath);
      }

      await this.getDatabase().projects.delete(id);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  }
}