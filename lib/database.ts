import Dexie, { Table } from 'dexie';
import { EncryptedFileStorage, EncryptedFileMetadata } from './encrypted-file-storage';
import { EncryptedProjectStorage, EncryptedProjectData } from './encrypted-project-storage';
import { EncryptedConversationStorage, EncryptedConversationData } from './encrypted-conversation-storage';

export interface User {
  id: string;
  name: string;
  password: string;
  createdAt: string;
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

    this.version(3).stores({
      users: 'id, name, createdAt',
      conversations: 'id, userId, title, createdAt, updatedAt, pinned',
      files: 'id, userId, name, type, path, parentId, createdAt, updatedAt',
      projects: 'id, userId, name, category, createdAt, updatedAt'
    });

    // Add debugging
    this.open().then(() => {
      console.log('LoRA Database opened successfully, version:', this.verno);
    }).catch(error => {
      console.error('Failed to open LoRA Database:', error);
    });
  }
}

export const db = new LoRADatabase();

// Database operations
export class DatabaseService {
  // User operations
  static async createUser(name: string, password: string): Promise<User | null> {
    try {
      const existingUser = await db.users.where('name').equalsIgnoreCase(name).first();
      if (existingUser) {
        return null; // User already exists
      }

      const user: User = {
        id: Date.now().toString(),
        name: name.trim(),
        password: password.trim(),
        createdAt: new Date().toISOString()
      };

      await db.users.add(user);
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  }

  static async getAllUsers(): Promise<User[]> {
    try {
      return await db.users.toArray();
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  static async getUserById(id: string): Promise<User | undefined> {
    try {
      return await db.users.get(id);
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  static async getUserByName(name: string): Promise<User | undefined> {
    try {
      return await db.users.where('name').equalsIgnoreCase(name).first();
    } catch (error) {
      console.error('Error getting user by name:', error);
      return undefined;
    }
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<void> {
    try {
      await db.users.update(id, updates);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }

  static async deleteUser(id: string): Promise<void> {
    try {
      await db.users.delete(id);
      // Also delete all conversations for this user
      await db.conversations.where('userId').equals(id).delete();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }

  // Conversation operations with encryption
  static async createConversation(
    userId: string,
    title: string,
    messages: any[],
    model: string,
    pinned: boolean = false,
    password?: string
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

      const conversation: Conversation = {
        ...conversationData,
        encryptedPath
      };

      await db.conversations.add(conversation);
      return conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }

  static async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    try {
      return await db.conversations.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  static async getConversationById(id: string): Promise<Conversation | undefined> {
    try {
      return await db.conversations.get(id);
    } catch (error) {
      console.error('Error getting conversation:', error);
      return undefined;
    }
  }

  static async updateConversation(id: string, updates: Partial<Conversation>, password?: string): Promise<void> {
    try {
      const existingConversation = await db.conversations.get(id);
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

      if (updatedEncryptedPath) {
        dbUpdates.encryptedPath = updatedEncryptedPath;
      }

      await db.conversations.update(id, dbUpdates);
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }

  static async deleteConversation(id: string, password?: string): Promise<void> {
    try {
      const conversation = await db.conversations.get(id);
      if (conversation?.encryptedPath) {
        // Delete the encrypted conversation from storage
        await EncryptedConversationStorage.deleteConversation(conversation.encryptedPath);
      }

      await db.conversations.delete(id);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }

  // Utility methods
  static async clearAllData(): Promise<void> {
    try {
      await db.users.clear();
      await db.conversations.clear();
      await db.files.clear();
      await db.projects.clear();
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }

  static async exportData(): Promise<{ users: User[], conversations: Conversation[] }> {
    try {
      const users = await db.users.toArray();
      const conversations = await db.conversations.toArray();
      return { users, conversations };
    } catch (error) {
      console.error('Error exporting data:', error);
      return { users: [], conversations: [] };
    }
  }

  static async exportConversationsForKnowledgeBase(userId: string, password?: string): Promise<string> {
    try {
      const conversations = await db.conversations.where('userId').equals(userId).toArray();

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

      await db.files.add(file);
      return file;
    } catch (error) {
      console.error('Error creating file:', error);
      return null;
    }
  }

  static async getFilesByUserId(userId: string): Promise<FileItem[]> {
    try {
      return await db.files.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting files:', error);
      return [];
    }
  }

  static async updateFile(id: string, updates: Partial<FileItem>): Promise<void> {
    try {
      await db.files.update(id, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating file:', error);
    }
  }

  static async loadFileContent(fileId: string, password: string): Promise<ArrayBuffer | null> {
    try {
      const file = await db.files.get(fileId);
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
      const file = await db.files.get(id);
      if (file?.encryptedPath) {
        // Delete the encrypted file from disk
        await EncryptedFileStorage.deleteFile(file.encryptedPath);
      }

      await db.files.delete(id);
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

      await db.projects.add(project);
      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      return null;
    }
  }

  static async getProjectsByUserId(userId: string): Promise<Project[]> {
    try {
      return await db.projects.where('userId').equals(userId).reverse().sortBy('updatedAt');
    } catch (error) {
      console.error('Error getting projects:', error);
      return [];
    }
  }

  static async updateProject(id: string, updates: Partial<Project>, password?: string): Promise<void> {
    try {
      const existingProject = await db.projects.get(id);
      if (!existingProject) return;

      // If password provided and project has encrypted data, update encrypted storage
      if (password && existingProject.encryptedPath) {
        await EncryptedProjectStorage.updateProject(
          existingProject.encryptedPath,
          updates,
          password
        );
      }

      await db.projects.update(id, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating project:', error);
    }
  }

  static async deleteProject(id: string): Promise<void> {
    try {
      const project = await db.projects.get(id);
      if (project?.encryptedPath) {
        // Delete the encrypted project from disk
        await EncryptedProjectStorage.deleteProject(project.encryptedPath);
      }

      await db.projects.delete(id);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  }
}