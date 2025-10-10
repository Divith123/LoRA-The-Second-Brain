"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjects } from "@/lib/database-hooks";
import { useUser } from "@/components/user-context";
import { useUpdateConversation } from "@/lib/database-hooks";
import { toast } from "sonner";

interface AddToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
}

export function AddToProjectDialog({ open, onOpenChange, conversationId }: AddToProjectDialogProps) {
  const { currentUser } = useUser();
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const updateConversationMutation = useUpdateConversation();

  const handleAddToProject = async (projectId: string) => {
    if (!conversationId || !currentUser) return;

    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        updates: { projectId },
        password: currentUser.password
      });
      toast.success("Conversation added to project");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to add conversation to project");
    }
  };

  const handleRemoveFromProject = async () => {
    if (!conversationId || !currentUser) return;

    try {
      await updateConversationMutation.mutateAsync({
        id: conversationId,
        updates: { projectId: undefined },
        password: currentUser.password
      });
      toast.success("Conversation removed from project");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to remove conversation from project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Conversation to Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Remove from project option */}
          <Button
            variant="outline"
            onClick={handleRemoveFromProject}
            className="w-full"
          >
            Remove from current project
          </Button>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
            {projects.length > 0 ? (
              projects.map((project) => (
                <Card
                  key={project.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleAddToProject(project.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${project.color || 'bg-gray-500'}`} />
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="px-2 py-1 bg-muted rounded-full">{project.category}</span>
                      <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <p>No projects available</p>
                <p className="text-sm">Create a project first to add conversations to it</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}