import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatabaseService, User, Conversation, FileItem, Project } from "@/lib/database";

// Query keys
export const queryKeys = {
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  conversation: (id: string) => ['conversations', 'detail', id] as const,
  files: (userId: string) => ['files', userId] as const,
  projects: (userId: string) => ['projects', userId] as const,
};

// User hooks
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve([]);
      }
      return DatabaseService.getAllUsers();
    },
    enabled: typeof window !== 'undefined' && !!window.indexedDB,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve(null);
      }
      return DatabaseService.getUserById(userId);
    },
    enabled: !!userId && typeof window !== 'undefined' && !!window.indexedDB,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, password }: { name: string; password: string }) =>
      DatabaseService.createUser(name, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) =>
      DatabaseService.updateUser(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      queryClient.invalidateQueries({ queryKey: queryKeys.user(id) });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => DatabaseService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

// Conversation hooks
export function useConversations(userId: string) {
  return useQuery({
    queryKey: queryKeys.conversations(userId),
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve([]);
      }
      return DatabaseService.getConversationsByUserId(userId);
    },
    enabled: !!userId && typeof window !== 'undefined' && !!window.indexedDB,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve(null);
      }
      return DatabaseService.getConversationById(conversationId);
    },
    enabled: !!conversationId && typeof window !== 'undefined' && !!window.indexedDB,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      title,
      messages,
      model,
      pinned = false,
      password
    }: {
      userId: string;
      title: string;
      messages: any[];
      model: string;
      pinned?: boolean;
      password?: string;
    }) => DatabaseService.createConversation(userId, title, messages, model, pinned, password),
    onSuccess: (newConversation, { userId }) => {
      // Invalidate and refetch conversations for this user
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations(userId) });
      // Also invalidate all conversations to be safe
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
      password
    }: {
      id: string;
      updates: Partial<Conversation>;
      password?: string;
    }) => DatabaseService.updateConversation(id, updates, password),
    onSuccess: () => {
      // Invalidate all conversation queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) => DatabaseService.deleteConversation(id, password),
    onSuccess: () => {
      // Invalidate all conversation queries since we don't know the userId
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// File hooks
export function useFiles(userId: string) {
  return useQuery({
    queryKey: queryKeys.files(userId),
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve([]);
      }
      return DatabaseService.getFilesByUserId(userId);
    },
    enabled: !!userId && typeof window !== 'undefined' && !!window.indexedDB,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useCreateFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      name,
      type,
      path,
      size,
      parentId,
      fileBuffer,
      password
    }: {
      userId: string;
      name: string;
      type: 'document' | 'image' | 'folder';
      path: string;
      size?: number;
      parentId?: string;
      fileBuffer?: ArrayBuffer;
      password?: string;
    }) => DatabaseService.createFile(userId, name, type, path, size, parentId, fileBuffer, password),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files(userId) });
    },
  });
}

export function useUpdateFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: Partial<FileItem>
    }) => DatabaseService.updateFile(id, updates),
    onSuccess: () => {
      // Invalidate all file queries since we don't know the userId
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useLoadFileContent() {
  return useMutation({
    mutationFn: ({
      fileId,
      password
    }: {
      fileId: string;
      password: string;
    }) => DatabaseService.loadFileContent(fileId, password),
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => DatabaseService.deleteFile(id),
    onSuccess: () => {
      // Invalidate all file queries since we don't know the userId
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// Project hooks
export function useProjects(userId: string) {
  return useQuery({
    queryKey: queryKeys.projects(userId),
    queryFn: () => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve([]);
      }
      return DatabaseService.getProjectsByUserId(userId);
    },
    enabled: !!userId && typeof window !== 'undefined' && !!window.indexedDB,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      name,
      description,
      category,
      color,
      password
    }: {
      userId: string;
      name: string;
      description: string;
      category: string;
      color?: string;
      password?: string;
    }) => DatabaseService.createProject(userId, name, description, category, color, password),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(userId) });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: Partial<Project>
    }) => DatabaseService.updateProject(id, updates),
    onSuccess: () => {
      // Invalidate all project queries since we don't know the userId
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useExportConversationsForKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password?: string }) =>
      DatabaseService.exportConversationsForKnowledgeBase(userId, password),
    onSuccess: (data) => {
      // Create and download the file
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lora-knowledge-base-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

// Utility hooks
export function useClearAllData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DatabaseService.clearAllData,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}