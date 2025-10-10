"use client";

import { MessageSquare, Pin, Clock } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolderOpen, faCubes, faPlus, faFile } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useConversations, useUpdateConversation, useDeleteConversation, useProjects, useFiles } from "@/lib/database-hooks";
import { useUser } from "./user-context";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, FolderPlus, Edit3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface SidebarNewChatProps {
  onNewChat: () => void;
}

export function SidebarNewChat({ onNewChat }: SidebarNewChatProps) {
  const handleClick = () => {
    console.log('New Chat button clicked');
    onNewChat();
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <Button
          onClick={handleClick}
          className="w-full justify-start gap-2 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground"
          variant="ghost"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
          New Chat
        </Button>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface SidebarFilesProps {
  onSeeAll?: () => void;
  onCreateFolder?: () => void;
  onSelectFile?: (fileId: string) => void;
  currentFileId?: string | null;
  currentFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
}

export function SidebarFiles({ onSeeAll, onCreateFolder, onSelectFile, currentFileId, currentFolderId, onSelectFolder }: SidebarFilesProps) {
  const { currentUser } = useUser();
  const { data: files = [] } = useFiles(currentUser?.id || '');

  // Always show root level folders and recent files in sidebar
  const currentFolders = files.filter(file => 
    file.type === 'folder' && 
    (file.parentId == null) // Always show root folders in sidebar
  ).slice(0, 2); // Show up to 2 folders
  
  const currentFiles = files.filter(file => 
    file.type !== 'folder' && 
    (file.parentId == null) // Show root level files
  ).slice(0, 3); // Show up to 3 recent files
  
  const hasMoreFolders = files.filter(file => 
    file.type === 'folder' && 
    (file.parentId == null)
  ).length > 2;
  
  const hasMoreFiles = files.filter(file => 
    file.type !== 'folder' && 
    (file.parentId == null)
  ).length > 3;

  console.log('SidebarFiles - files:', files.length, 'folders:', files.filter(f => f.type === 'folder').length, 'currentFolders:', currentFolders.length, 'currentFiles:', currentFiles.length);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Files</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCreateFolder}
          >
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          </Button>
          {(hasMoreFolders || hasMoreFiles) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onSeeAll}
            >
              See All
            </Button>
          )}
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* Show folders first */}
          {currentFolders.length > 0 && currentFolders.map((folder) => (
            <SidebarMenuItem key={folder.id}>
              <SidebarMenuButton
                onClick={() => onSelectFolder?.(folder.id)}
                isActive={currentFileId === folder.id}
              >
                <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4" />
                <span className="truncate">{folder.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          
          {/* Show files */}
          {currentFiles.length > 0 && currentFiles.map((file) => (
            <SidebarMenuItem key={file.id}>
              <SidebarMenuButton
                onClick={() => onSelectFile?.(file.id)}
                isActive={currentFileId === file.id}
              >
                <FontAwesomeIcon icon={faFile} className="w-4 h-4" />
                <span className="truncate">{file.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          
          {/* Show empty state */}
          {currentFolders.length === 0 && currentFiles.length === 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <FontAwesomeIcon icon={faFile} className="w-4 h-4" />
                <span className="text-muted-foreground">No files uploaded</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface SidebarProjectsProps {
  onSeeAll?: () => void;
  onCreateProject?: () => void;
  onSelectProject?: (projectId: string) => void;
}

export function SidebarProjects({ onSeeAll, onCreateProject, onSelectProject }: SidebarProjectsProps) {
  const { currentUser } = useUser();
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const { data: conversations = [] } = useConversations(currentUser?.id || '');

  // Show only the first project in sidebar, rest go to "See All"
  const visibleProjects = projects.slice(0, 1);
  const hasMoreProjects = projects.length > 1;

  // Count conversations per project
  const getProjectConversationCount = (projectId: string) => {
    return conversations.filter(conv => conv.projectId === projectId).length;
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Projects</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCreateProject}
          >
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          </Button>
          {(hasMoreProjects || projects.length === 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onSeeAll}
            >
              See All
            </Button>
          )}
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleProjects.length > 0 ? (
            visibleProjects.map((project) => {
              const conversationCount = getProjectConversationCount(project.id);
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    onClick={() => onSelectProject?.(project.id)}
                  >
                    <FontAwesomeIcon icon={faCubes} className="w-4 h-4" />
                    <span className="truncate">{project.name}</span>
                    {conversationCount > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                        {conversationCount}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <FontAwesomeIcon icon={faCubes} className="w-4 h-4" />
                <span className="text-muted-foreground">No projects created</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface SidebarChatsProps {
  onSelectConversation: (conversationId: string) => void;
  currentConversationId: string | null;
  onSeeAll?: (type: 'pinned' | 'recent') => void;
  onAddToProject?: (conversationId: string) => void;
}

export function SidebarPinnedChats({ onSelectConversation, currentConversationId, onSeeAll, onAddToProject }: SidebarChatsProps) {
  const { currentUser } = useUser();
  const { data: conversations = [] } = useConversations(currentUser?.id || '');
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const updateConversationMutation = useUpdateConversation();
  const deleteConversationMutation = useDeleteConversation();

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Filter only pinned conversations
  const pinnedConversations = conversations.filter(conv => conv.pinned);

  const handleTogglePin = async (conversationId: string, currentlyPinned: boolean) => {
    if (!currentUser) return;
    
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        updates: { pinned: !currentlyPinned },
        password: currentUser.password
      });
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  };

  const handleRenameChat = (conversationId: string, currentTitle: string) => {
    setRenamingConversation({ id: conversationId, title: currentTitle });
    setNewTitle(currentTitle);
    setRenameDialogOpen(true);
  };

  const handleSaveRename = async () => {
    if (!currentUser || !renamingConversation || !newTitle.trim()) return;

    try {
      await updateConversationMutation.mutateAsync({
        id: renamingConversation.id,
        updates: { title: newTitle.trim() },
        password: currentUser.password
      });
      setRenameDialogOpen(false);
      setRenamingConversation(null);
      setNewTitle('');
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  };

  const handleCancelRename = () => {
    setRenameDialogOpen(false);
    setRenamingConversation(null);
    setNewTitle('');
  };

  const handleDeleteChat = async (conversationId: string) => {
    if (!currentUser) return;
    
    try {
      await deleteConversationMutation.mutateAsync({
        id: conversationId,
        password: currentUser.password
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Pinned Chats</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {pinnedConversations.length > 0 ? (
              pinnedConversations.map((conversation) => (
                <SidebarMenuItem key={conversation.id} className="group relative">
                  <SidebarMenuButton
                    onClick={() => onSelectConversation(conversation.id)}
                    isActive={currentConversationId === conversation.id}
                    className="pr-8"
                  >
                    <Pin className="h-4 w-4" />
                    <span className="truncate">{conversation.title}</span>
                  </SidebarMenuButton>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleRenameChat(conversation.id, conversation.title)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Rename Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTogglePin(conversation.id, conversation.pinned || false)}>
                          <Pin className="h-4 w-4 mr-2" />
                          {conversation.pinned ? 'Unpin Chat' : 'Pin Chat'}
                        </DropdownMenuItem>
                        {projects.length > 0 && (
                          <DropdownMenuItem onClick={() => onAddToProject?.(conversation.id)}>
                            <FolderPlus className="h-4 w-4 mr-2" />
                            Add to Project
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDeleteChat(conversation.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </SidebarMenuItem>
              ))
            ) : (
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <Pin className="h-4 w-4" />
                  <span className="text-muted-foreground">No pinned chats</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Chat Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="chat-title">Chat Title</Label>
              <Input
                id="chat-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter new chat title"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveRename();
                  } else if (e.key === 'Escape') {
                    handleCancelRename();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelRename}>
              Cancel
            </Button>
            <Button onClick={handleSaveRename} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function SidebarRecentChats({ onSelectConversation, currentConversationId, onSeeAll, onAddToProject }: SidebarChatsProps) {
  const { currentUser } = useUser();
  const { data: conversations = [] } = useConversations(currentUser?.id || '');
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const updateConversationMutation = useUpdateConversation();
  const deleteConversationMutation = useDeleteConversation();

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Recent conversations (excluding pinned ones)
  const recentConversations = conversations.filter(conv => !conv.pinned);
  
  // Find the most recent conversation (by updatedAt or createdAt)
  const mostRecentConversationId = recentConversations.length > 0 
    ? recentConversations.reduce((mostRecent, current) => {
        const mostRecentTime = new Date(mostRecent.updatedAt || mostRecent.createdAt).getTime();
        const currentTime = new Date(current.updatedAt || current.createdAt).getTime();
        return currentTime > mostRecentTime ? current : mostRecent;
      }).id
    : null;

  const handleTogglePin = async (conversationId: string, currentlyPinned: boolean) => {
    if (!currentUser) return;
    
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        updates: { pinned: !currentlyPinned },
        password: currentUser.password
      });
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  };

  const handleRenameChat = (conversationId: string, currentTitle: string) => {
    setRenamingConversation({ id: conversationId, title: currentTitle });
    setNewTitle(currentTitle);
    setRenameDialogOpen(true);
  };

  const handleSaveRename = async () => {
    if (!currentUser || !renamingConversation || !newTitle.trim()) return;

    try {
      await updateConversationMutation.mutateAsync({
        id: renamingConversation.id,
        updates: { title: newTitle.trim() },
        password: currentUser.password
      });
      setRenameDialogOpen(false);
      setRenamingConversation(null);
      setNewTitle('');
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  };

  const handleCancelRename = () => {
    setRenameDialogOpen(false);
    setRenamingConversation(null);
    setNewTitle('');
  };

  const handleDeleteChat = async (conversationId: string) => {
    if (!currentUser) return;
    
    try {
      await deleteConversationMutation.mutateAsync({
        id: conversationId,
        password: currentUser.password
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <span>Recent Chats</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {recentConversations.length > 0 ? (
              recentConversations.map((conversation) => (
                <SidebarMenuItem key={conversation.id} className="group relative">
                  <SidebarMenuButton
                    onClick={() => onSelectConversation(conversation.id)}
                    isActive={currentConversationId === conversation.id}
                    className="pr-8"
                  >
                    {conversation.id === mostRecentConversationId ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <div className="w-4" /> // Empty space to maintain alignment
                    )}
                    <span className="truncate">{conversation.title}</span>
                  </SidebarMenuButton>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleRenameChat(conversation.id, conversation.title)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Rename Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTogglePin(conversation.id, conversation.pinned || false)}>
                          <Pin className="h-4 w-4 mr-2" />
                          {conversation.pinned ? 'Unpin Chat' : 'Pin Chat'}
                        </DropdownMenuItem>
                        {projects.length > 0 && (
                          <DropdownMenuItem onClick={() => onAddToProject?.(conversation.id)}>
                            <FolderPlus className="h-4 w-4 mr-2" />
                            Add to Project
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDeleteChat(conversation.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </SidebarMenuItem>
              ))
            ) : (
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <div className="w-4" /> {/* Empty space to maintain alignment */}
                  <span className="text-muted-foreground">No recent chats</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Chat Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="chat-title">Chat Title</Label>
              <Input
                id="chat-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter new chat title"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveRename();
                  } else if (e.key === 'Escape') {
                    handleCancelRename();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelRename}>
              Cancel
            </Button>
            <Button onClick={handleSaveRename} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}