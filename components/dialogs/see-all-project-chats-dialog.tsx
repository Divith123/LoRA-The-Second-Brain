"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare } from "lucide-react";
import { useConversations } from "@/lib/database-hooks";
import { useUser } from "@/components/user-context";

interface SeeAllProjectChatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName: string;
  onSelectConversation: (conversationId: string) => void;
}

export function SeeAllProjectChatsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onSelectConversation
}: SeeAllProjectChatsDialogProps) {
  const { currentUser } = useUser();
  const { data: conversations = [] } = useConversations(currentUser?.id || '');
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations that belong to this project
  const projectConversations = conversations
    .filter(conv => conv.projectId === projectId)
    .filter(conv => conv.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chats in &quot;{projectName}&quot;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Conversations List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {projectConversations.length > 0 ? (
              projectConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="flex items-center p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    onSelectConversation(conversation.id);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{conversation.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {conversation.pinned && <span className="inline-flex items-center gap-1 mr-2">📌 Pinned</span>}
                      Updated {new Date(conversation.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No conversations in this project</p>
                <p className="text-sm">Add conversations to this project using the chat menu</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}