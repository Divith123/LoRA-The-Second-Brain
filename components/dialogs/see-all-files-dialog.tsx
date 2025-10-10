"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, FileText, Image, Search, Upload, Plus, ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { useFiles, useCreateFile, useDeleteFile } from "@/lib/database-hooks";
import { useUser } from "@/components/user-context";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface SeeAllFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect?: (file: { id: string; name: string; size?: number }) => void;
}

export function SeeAllFilesDialog({ open, onOpenChange, onFileSelect }: SeeAllFilesDialogProps) {
  const { currentUser } = useUser();
  const { data: files = [] } = useFiles(currentUser?.id || '');
  const createFileMutation = useCreateFile();
  const deleteFileMutation = useDeleteFile();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string[]>([]);

  // Filter files based on current folder
  const currentFiles = files.filter(file => {
    if (currentFolderId === null) {
      // Root level - files with no parent
      return !file.parentId;
    } else {
      // Inside a folder - files with matching parentId
      return file.parentId === currentFolderId;
    }
  });

  const filteredFiles = currentFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !currentUser) return;

    console.log('Creating folder:', folderName.trim(), 'in folder:', currentFolderId);

    try {
      const result = await createFileMutation.mutateAsync({
        userId: currentUser.id,
        name: folderName.trim(),
        type: 'folder',
        path: `${currentFolderId ? files.find(f => f.id === currentFolderId)?.path : ''}/${folderName.trim()}`,
        parentId: currentFolderId || undefined
      });

      console.log('Folder created result:', result);

      setFolderName("");
      setShowCreateFolder(false);
      toast.success("Folder created successfully");
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error("Failed to create folder");
    }
  };

  const handleFolderClick = (file: any) => {
    if (file.type === 'folder') {
      setCurrentFolderId(file.id);
      setFolderPath([...folderPath, file.name]);
      setSearchQuery(""); // Clear search when navigating
    }
  };

  const handleNavigateUp = () => {
    if (folderPath.length > 0) {
      const newPath = [...folderPath];
      newPath.pop();
      setFolderPath(newPath);

      if (newPath.length === 0) {
        setCurrentFolderId(null);
      } else {
        // Find the parent folder ID
        const parentFolder = files.find(f =>
          f.name === newPath[newPath.length - 1] &&
          f.type === 'folder' &&
          (!f.parentId || newPath.length === 1)
        );
        setCurrentFolderId(parentFolder?.id || null);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    console.log('Uploading file:', file.name, 'size:', file.size);

    try {
      // Read file as ArrayBuffer
      const fileBuffer = await file.arrayBuffer();
      console.log('File buffer size:', fileBuffer.byteLength);

      // For now, just create a file entry
      // In a real implementation, you'd upload the file to storage
      const fileType = file.type.startsWith('image/') ? 'image' : 'document';

      createFileMutation.mutate({
        userId: currentUser.id,
        name: file.name,
        type: fileType,
        path: `${currentFolderId ? files.find(f => f.id === currentFolderId)?.path : ''}/${file.name}`,
        size: file.size,
        parentId: currentFolderId || undefined,
        fileBuffer: fileBuffer,
        password: currentUser.password // Use user's password for encryption
      }, {
        onSuccess: (result) => {
          console.log('File upload result:', result);
          toast.success("File uploaded and encrypted successfully");
        },
        onError: (error) => {
          console.error('File upload error:', error);
          toast.error("Failed to upload and encrypt file");
        }
      });
    } catch (error) {
      console.error('File read error:', error);
      toast.error("Failed to read file");
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    try {
      await deleteFileMutation.mutateAsync(fileId);
      toast.success(`"${fileName}" deleted successfully`);
    } catch (error) {
      toast.error("Failed to delete file");
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'folder':
        return <FolderOpen className="h-8 w-8 text-blue-500" />;
      case 'image':
        return <Image className="h-8 w-8 text-green-500" aria-hidden="true" />;
      default:
        return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  const formatFileSize = (size?: number) => {
    if (!size) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {folderPath.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateUp}
                  className="p-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <span>
                Files{folderPath.length > 0 && ` / ${folderPath.join(' / ')}`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateFolder(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
              <Button variant="outline" size="sm" asChild>
                <label>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,.pdf,.doc,.docx,.txt"
                  />
                </label>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Create Folder Input */}
          {showCreateFolder && (
            <div className="flex gap-2">
              <Input
                placeholder="Folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <Button onClick={handleCreateFolder}>Create</Button>
              <Button variant="outline" onClick={() => setShowCreateFolder(false)}>Cancel</Button>
            </div>
          )}

          {/* Files Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
            {filteredFiles.length > 0 ? (
              filteredFiles.map((file) => (
                <Card
                  key={file.id}
                  className={`hover:shadow-md transition-shadow ${file.type === 'folder' ? 'cursor-pointer' : 'cursor-default'} relative group`}
                >
                  <CardContent className="p-4 text-center">
                    <div className="flex justify-center mb-2 relative">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      {onFileSelect && file.type !== 'folder' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 bg-primary/10 hover:bg-primary/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFileSelect({ id: file.id, name: file.name, size: file.size });
                            onOpenChange(false);
                          }}
                          title="Select file for message"
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDeleteFile(file.id, file.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    {file.size && (
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(file.updatedAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                  {file.type === 'folder' && (
                    <div
                      className="absolute inset-0 cursor-pointer"
                      style={{ top: '2rem', right: '2rem', bottom: 0, left: 0 }}
                      onClick={() => handleFolderClick(file)}
                    />
                  )}
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                {currentFolderId ? 'This folder is empty' : 'No files found'}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}