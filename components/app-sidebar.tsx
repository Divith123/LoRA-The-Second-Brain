"use client";

import * as React from "react";
import { AudioWaveform } from "lucide-react";

import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import { SidebarSearch } from "@/components/sidebar-search";
import {
  SidebarNewChat,
  SidebarFiles,
  SidebarProjects,
  SidebarPinnedChats,
  SidebarRecentChats
} from "@/components/sidebar-sections";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  user: {
    name: "LoRA User",
    email: "user@lora.ai",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "LoRA - The Second Brain",
      plan: "",
    },
    {
      name: "Personal",
      logo: AudioWaveform,
      plan: "Free",
    },
  ],
};

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onNewChat?: () => void;
  onSelectConversation?: (conversationId: string) => void;
  currentConversationId?: string | null;
  onSeeAllChats?: (type: 'pinned' | 'recent') => void;
  onSeeAllFiles?: () => void;
  onCreateFolder?: () => void;
  onSelectFile?: (fileId: string) => void;
  currentFileId?: string | null;
  currentFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onSeeAllProjects?: () => void;
  onCreateProject?: () => void;
  onSelectProject?: (projectId: string) => void;
  currentProjectId?: string | null;
  onAddToProject?: (conversationId: string) => void;
  onOpenSettings?: () => void;
}

export function AppSidebar({
  onNewChat = () => {},
  onSelectConversation = () => {},
  currentConversationId = null,
  onSeeAllChats = () => {},
  onSeeAllFiles = () => {},
  onCreateFolder = () => {},
  onSelectFile = () => {},
  currentFileId = null,
  currentFolderId = null,
  onSelectFolder = () => {},
  onSeeAllProjects = () => {},
  onCreateProject = () => {},
  onSelectProject = () => {},
  onAddToProject = () => {},
  onOpenSettings = () => {},
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="flex flex-row items-center gap-0 pt-4 pb-2 px-2">
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        {/* Search bar at top */}
        <SidebarSearch />

        {/* New Chat */}
        <SidebarNewChat onNewChat={onNewChat} />

        {/* Files */}
        <SidebarFiles
          onSeeAll={onSeeAllFiles}
          onCreateFolder={onCreateFolder}
          onSelectFile={onSelectFile}
          currentFileId={currentFileId}
          currentFolderId={currentFolderId}
          onSelectFolder={onSelectFolder}
        />

        {/* Projects */}
        <SidebarProjects
          onSeeAll={onSeeAllProjects}
          onCreateProject={onCreateProject}
          onSelectProject={onSelectProject}
        />

        {/* Pinned Chats */}
        <SidebarPinnedChats
          onSelectConversation={onSelectConversation}
          currentConversationId={currentConversationId}
          onSeeAll={onSeeAllChats}
          onAddToProject={onAddToProject}
        />

        {/* Recent Chats */}
        <SidebarRecentChats
          onSelectConversation={onSelectConversation}
          currentConversationId={currentConversationId}
          onSeeAll={onSeeAllChats}
          onAddToProject={onAddToProject}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser onOpenSettings={onOpenSettings} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}