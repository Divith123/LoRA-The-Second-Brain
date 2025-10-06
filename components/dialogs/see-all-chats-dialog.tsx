"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pin, Clock, Search, X } from "lucide-react";
import { useConversations, useUpdateConversation } from "@/lib/database-hooks";
import { useUser } from "@/components/user-context";
import { toast } from "sonner";

interface SeeAllChatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'pinned' | 'recent';
  onSelectConversation: (conversationId: string) => void;
}

export function SeeAllChatsDialog({ open, onOpenChange, type, onSelectConversation }: SeeAllChatsDialogProps) {
  const { currentUser } = useUser();
  const { data: conversations = [] } = useConversations(currentUser?.id || '');
  const updateConversationMutation = useUpdateConversation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations
    .filter(conv => type === 'pinned' ? conv.pinned : !conv.pinned)
    .filter(conv => conv.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleTogglePin = async (conversationId: string, currentlyPinned: boolean) => {
    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        updates: { pinned: !currentlyPinned },
        password: currentUser?.password,
      });
      toast.success(currentlyPinned ? "Unpinned conversation" : "Pinned conversation");
    } catch (error) {
      toast.error("Failed to update conversation");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'pinned' ? <Pin className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            {type === 'pinned' ? 'Pinned Chats' : 'Recent Chats'}
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
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer group"
                  onClick={() => {
                    onSelectConversation(conversation.id);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{conversation.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin(conversation.id, conversation.pinned || false);
                    }}
                  >
                    {conversation.pinned ? <X className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No {type} conversations found
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}