"use client";

import React, { ReactNode, useState, createContext, useContext, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useOllamaStatus } from "@/lib/model-hooks";
import { SystemCheck } from "@/components/system-check";
import { useQueryClient } from "@tanstack/react-query";

import { ProviderType } from "@/lib/model-types";

// Create a context for model state
const ModelContext = createContext<{
  currentModel: string;
  currentProvider?: ProviderType;
  onModelChange: (model: string, provider?: ProviderType) => void;
}>({
  currentModel: '',
  onModelChange: () => {},
});

export const useModel = () => useContext(ModelContext);

interface AppContentProps {
  children: ReactNode;
}

function AppContentInner({ children }: AppContentProps) {
  const { isAuthenticated, isLoading, currentUser } = useUser();
  const { currentConversationId, setCurrentConversationId } = useConversation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: isOllamaRunning = false } = useOllamaStatus();
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

  return (
    <ModelContext.Provider value={{ currentModel, currentProvider, onModelChange: handleModelChange }}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          currentConversationId={currentConversationId}
          onSeeAllChats={handleSeeAllChats}
          onSeeAllFiles={handleSeeAllFiles}
          onCreateFolder={handleCreateFolder}
          onSeeAllProjects={handleSeeAllProjects}
          onCreateProject={handleCreateProject}
        />
        <SidebarInset>
          <Nav />
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