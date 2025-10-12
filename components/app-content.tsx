"use client";

import React, { ReactNode, useState, createContext, useContext, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Nav from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Login } from "@/components/login";
import { useUser } from "@/components/user-context";
import { ConversationProvider, useConversation } from "@/components/conversation-context";
import { SeeAllChatsDialog } from "@/components/dialogs/see-all-chats-dialog";
import { SeeAllFilesDialog } from "@/components/dialogs/see-all-files-dialog";
import { SeeAllProjectsDialog } from "@/components/dialogs/see-all-projects-dialog";
import { AddToProjectDialog } from "@/components/dialogs/add-to-project-dialog";
import { SeeAllProjectChatsDialog } from "@/components/dialogs/see-all-project-chats-dialog";
import { useOllamaStatus } from "@/lib/model-hooks";
import { SystemCheck } from "@/components/system-check";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/lib/database-hooks";
import { SettingsModal } from "@/components/settings-modal";

import { ProviderType } from "@/lib/model-types";

// Create a context for model state
const ModelContext = createContext<{
  currentModel: string;
  currentProvider?: ProviderType;
  onModelChange: (model: string, provider?: ProviderType) => void;
  onOpenFilesDialog?: () => void;
}>({
  currentModel: '',
  onModelChange: () => {},
  onOpenFilesDialog: () => {},
});

export const useModel = () => useContext(ModelContext);

// DeepSecure context to share selected media type with Nav and the DeepSecureAI page
export const DeepSecureContext = createContext<{
  mediaType: 'image' | 'video' | 'audio';
  setMediaType: (t: 'image' | 'video' | 'audio') => void;
} | null>(null);

export const useDeepSecure = () => {
  const ctx = useContext(DeepSecureContext);
  if (!ctx) {
    throw new Error('useDeepSecure must be used within DeepSecureContext');
  }
  return ctx;
};

// Create a context for file preview state
const FilePreviewContext = createContext<{
  currentFileId: string | null;
  setCurrentFileId: (fileId: string | null) => void;
}>({
  currentFileId: null,
  setCurrentFileId: () => {},
});

export const useFilePreview = () => useContext(FilePreviewContext);

interface AppContentProps {
  children: ReactNode;
}

function AppContentInner({ children }: AppContentProps) {
  const { isAuthenticated, isLoading, currentUser } = useUser();
  const { currentConversationId, setCurrentConversationId } = useConversation();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: isOllamaRunning = false } = useOllamaStatus();
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const [currentModel, setCurrentModel] = useState(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedModel');
      return stored || '';
    }
    return '';
  });
  const [currentProvider, setCurrentProvider] = useState<ProviderType | undefined>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedProvider');
      return stored as ProviderType || undefined;
    }
    return undefined;
  });

  // Dialog states
  const [chatsDialogOpen, setChatsDialogOpen] = useState(false);
  const [chatsDialogType, setChatsDialogType] = useState<'pinned' | 'recent'>('recent');
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);
  const [addToProjectDialogOpen, setAddToProjectDialogOpen] = useState(false);
  const [conversationToAddToProject, setConversationToAddToProject] = useState<string | null>(null);
  const [projectChatsDialogOpen, setProjectChatsDialogOpen] = useState(false);
  const [selectedProjectForChats, setSelectedProjectForChats] = useState<{ id: string; name: string } | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [deepMediaType, setDeepMediaType] = useState<'image' | 'video' | 'audio'>('image');

  // Settings modal state
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  // Initialize sidebar state from cookie
  const [sidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const cookies = document.cookie.split('; ');
      const sidebarCookie = cookies.find(row => row.startsWith('sidebar_state='));
      if (sidebarCookie) {
        const value = sidebarCookie.split('=')[1];
        return value === 'true';
      }
    }
    return true;
  });

  const handleLogin = () => {
    // Login completed, component will re-render naturally due to state change
  };

  const handleNewChat = () => {
    console.log('handleNewChat called');
    setCurrentConversationId(null);
    // Update URL to remove conversation parameter
    router.push('/', { scroll: false });
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    // Update URL with conversation parameter
    router.push(`/?conversation=${conversationId}`, { scroll: false });
  };

  const handleSeeAllChats = (type: 'pinned' | 'recent') => {
    setChatsDialogType(type);
    setChatsDialogOpen(true);
  };

  const handleSeeAllFiles = () => {
    setFilesDialogOpen(true);
  };

  const handleCreateFolder = () => {
    setFilesDialogOpen(true);
  };

  const handleSeeAllProjects = () => {
    setProjectsDialogOpen(true);
  };

  const handleCreateProject = () => {
    setProjectsDialogOpen(true);
  };

  const handleAddToProject = (conversationId: string) => {
    setConversationToAddToProject(conversationId);
    setAddToProjectDialogOpen(true);
  };

  const handleSelectFile = (fileId: string) => {
    // For sidebar file clicks, we want to open preview
    // This will be handled by the Chat component
    setCurrentFileId(fileId);
  };

  const handleSelectProject = (projectId: string) => {
    // Find the project name and open the project chats dialog
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setSelectedProjectForChats({ id: projectId, name: project.name });
      setProjectChatsDialogOpen(true);
    }
  };

  const handleSelectFolder = (folderId: string | null) => {
    // Open the SeeAllFilesDialog with the selected folder
    setFilesDialogOpen(true);
    setCurrentFolderId(folderId);
  };

  const handleModelChange = (model: string, provider?: ProviderType) => {
    // Infer provider from model name if not provided
    if (!provider) {
      if (model.includes('/')) {
        provider = 'openrouter'; // Default namespaced models to OpenRouter
      } else {
        provider = 'ollama'; // Default simple model names to Ollama
      }
    }

    setCurrentModel(model);
    setCurrentProvider(provider);
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedModel', model);
      if (provider) {
        localStorage.setItem('selectedProvider', provider);
      } else {
        localStorage.removeItem('selectedProvider');
      }
    }
  };

  // Automatically select OpenRouter model if Ollama is not running and no model is selected
  useEffect(() => {
    if (!isOllamaRunning && !currentModel && typeof window !== 'undefined') {
      // Check if OpenRouter API key is configured
      const openRouterKey = localStorage.getItem('openrouter_api_key') || process.env.OPENROUTER_API_KEY;
      if (openRouterKey) {
        // Automatically select the first OpenRouter model
        handleModelChange('openai/gpt-4o', 'openrouter');
      }
    }
  }, [isOllamaRunning, currentModel, handleModelChange]);

  // Show loading state while determining authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading LoRA...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const isProfilePage = pathname === '/profile';
  const isDeepSecurePage = pathname?.startsWith('/DeepSecureAI');
  const isWhatsNewPage = pathname === '/whats-new';

  return (
    <ModelContext.Provider value={{ currentModel, currentProvider, onModelChange: handleModelChange, onOpenFilesDialog: handleSeeAllFiles }}>
      <DeepSecureContext.Provider value={{ mediaType: deepMediaType, setMediaType: setDeepMediaType }}>
        <FilePreviewContext.Provider value={{ currentFileId, setCurrentFileId }}>
        <SidebarProvider defaultOpen={sidebarOpen}>
          {/* Hide the sidebar for DeepSecureAI page and WhatsNew page specifically */}
          {!isProfilePage && !isDeepSecurePage && !isWhatsNewPage && (
            <AppSidebar
              onNewChat={handleNewChat}
              onSelectConversation={handleSelectConversation}
              currentConversationId={currentConversationId}
              onSeeAllChats={handleSeeAllChats}
              onSeeAllFiles={handleSeeAllFiles}
              onCreateFolder={handleCreateFolder}
              onSelectFile={handleSelectFile}
              currentFileId={currentFileId}
              currentFolderId={currentFolderId}
              onSelectFolder={handleSelectFolder}
              onSeeAllProjects={handleSeeAllProjects}
              onCreateProject={handleCreateProject}
              onSelectProject={handleSelectProject}
              onAddToProject={handleAddToProject}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
          )}
          <SidebarInset>
            {!isProfilePage && !isWhatsNewPage && <Nav showSidebar={!isDeepSecurePage} showMediaSelector={isDeepSecurePage} hideLeftButtons={settingsModalOpen} />}
            <Toaster position={"top-center"} richColors />
            <SystemCheck />
            {children}
            <Analytics />
          </SidebarInset>
        </SidebarProvider>

        {/* Dialogs */}
        <SeeAllChatsDialog
          open={chatsDialogOpen}
          onOpenChange={setChatsDialogOpen}
          type={chatsDialogType}
          onSelectConversation={handleSelectConversation}
        />
        <SeeAllFilesDialog
          open={filesDialogOpen}
          onOpenChange={setFilesDialogOpen}
        />
        <SeeAllProjectsDialog
          open={projectsDialogOpen}
          onOpenChange={setProjectsDialogOpen}
        />
        <AddToProjectDialog
          open={addToProjectDialogOpen}
          onOpenChange={setAddToProjectDialogOpen}
          conversationId={conversationToAddToProject}
        />
        <SeeAllProjectChatsDialog
          open={projectChatsDialogOpen}
          onOpenChange={setProjectChatsDialogOpen}
          projectId={selectedProjectForChats?.id || null}
          projectName={selectedProjectForChats?.name || ''}
          onSelectConversation={handleSelectConversation}
        />
        <SettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
        />
      </FilePreviewContext.Provider>
      </DeepSecureContext.Provider>
    </ModelContext.Provider>
  );
}

export function AppContent({ children }: AppContentProps) {
  return (
    <ConversationProvider>
      <AppContentInner>{children}</AppContentInner>
    </ConversationProvider>
  );
}