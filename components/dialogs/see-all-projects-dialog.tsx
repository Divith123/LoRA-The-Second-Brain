"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Folder } from "lucide-react";
import { useProjects, useCreateProject } from "@/lib/database-hooks";
import { useUser } from "@/components/user-context";
import { toast } from "sonner";

interface SeeAllProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const projectCategories = [
  'Development',
  'Research',
  'Writing',
  'Design',
  'Personal',
  'Business',
  'Education',
  'Other'
];

const categoryColors = {
  'Development': 'bg-blue-500',
  'Research': 'bg-purple-500',
  'Writing': 'bg-green-500',
  'Design': 'bg-pink-500',
  'Personal': 'bg-yellow-500',
  'Business': 'bg-indigo-500',
  'Education': 'bg-red-500',
  'Other': 'bg-gray-500'
};

export function SeeAllProjectsDialog({ open, onOpenChange }: SeeAllProjectsDialogProps) {
  const { currentUser } = useUser();
  const { data: projects = [] } = useProjects(currentUser?.id || '');
  const createProjectMutation = useCreateProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectCategory, setProjectCategory] = useState("");

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async () => {
    if (!projectName.trim() || !projectCategory || !currentUser) return;

    try {
      await createProjectMutation.mutateAsync({
        userId: currentUser.id,
        name: projectName.trim(),
        description: projectDescription.trim(),
        category: projectCategory,
        color: categoryColors[projectCategory as keyof typeof categoryColors]
      });
      setProjectName("");
      setProjectDescription("");
      setProjectCategory("");
      setShowCreateProject(false);
      toast.success("Project created successfully");
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Projects</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateProject(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Create Project Form */}
          {showCreateProject && (
            <Card>
              <CardHeader>
                <CardTitle>Create New Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    placeholder="Project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </div>
                <div>
                  <textarea
                    placeholder="Project description (optional)"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div>
                  <Select value={projectCategory} onValueChange={setProjectCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="scrollbar-hide">
                      {projectCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateProject}>Create Project</Button>
                  <Button variant="outline" onClick={() => setShowCreateProject(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer">
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
                <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No projects found</p>
                <p className="text-sm">Create your first project to get started</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}