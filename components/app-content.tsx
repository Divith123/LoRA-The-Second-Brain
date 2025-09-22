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
import { DatabaseService } from "@/lib/database";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Create a context for model state
const ModelContext = createContext<{
  currentModel: string;
  onModelChange: (model: string) => void;
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
  const [currentModel, setCurrentModel] = useState(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedModel');
      return stored || '';
    }
    return '';
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

  const handleModelChange = (model: string) => {
    setCurrentModel(model);
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedModel', model);
    }
  };

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
    <ModelContext.Provider value={{ currentModel, onModelChange: handleModelChange }}>
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