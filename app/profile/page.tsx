"use client";

import { useUser } from "@/components/user-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Calendar, Settings, LogOut, Camera, Trash2, Home, AlertTriangle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { DatabaseService } from "@/lib/database";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const { currentUser, users, logout, refreshCurrentUser } = useUser();
  const router = useRouter();
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [allUserAvatars, setAllUserAvatars] = useState<Record<string, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Load user avatar on component mount
  useEffect(() => {
    if (currentUser) {
      loadUserAvatar();
      loadAllUserAvatars();
    }
  }, [currentUser, users]);

  const loadUserAvatar = async () => {
    if (!currentUser) return;
    
    try {
      const avatar = await DatabaseService.getUserAvatar(currentUser.id, currentUser.password);
      setUserAvatar(avatar);
    } catch (error) {
      console.error('Error loading avatar:', error);
    }
  };

  const loadAllUserAvatars = async () => {
    if (!currentUser) return;

    const avatars: Record<string, string | null> = {};
    
    for (const user of users) {
      try {
        const avatar = await DatabaseService.getUserAvatar(user.id, currentUser.password);
        avatars[user.id] = avatar;
      } catch (error) {
        console.error(`Error loading avatar for user ${user.id}:`, error);
        avatars[user.id] = null;
      }
    }
    
    setAllUserAvatars(avatars);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const success = await DatabaseService.updateUserAvatar(currentUser.id, file, currentUser.password);
      if (success) {
        toast.success('Avatar updated successfully');
        await loadUserAvatar(); // Reload avatar
        await refreshCurrentUser(); // Refresh user context
      } else {
        toast.error('Failed to update avatar');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser) return;

    try {
      const success = await DatabaseService.deleteUserAvatar(currentUser.id);
      if (success) {
        toast.success('Avatar removed successfully');
        setUserAvatar(null);
        await refreshCurrentUser(); // Refresh user context
      } else {
        toast.error('Failed to remove avatar');
      }
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error('Failed to remove avatar');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view your profile</h1>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !deletePassword.trim()) {
      toast.error("Please enter your password");
      return;
    }

    setIsDeleting(true);
    try {
      const success = await DatabaseService.deleteUserByPassword(currentUser.id, deletePassword);
      if (success) {
        toast.success("Account deleted successfully");
        logout(); // This will redirect to login
      } else {
        toast.error("Incorrect password. Account deletion failed.");
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    } finally {
      setIsDeleting(false);
      setDeletePassword("");
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4 relative">
      {/* Back to Home Button - positioned absolutely in top-left corner */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          onClick={() => router.push('/')}
          variant="outline"
          className="flex items-center gap-2 bg-background/95 backdrop-blur-sm border-border/50 shadow-lg"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Button>
      </div>

      <div className="max-w-4xl mx-auto pt-8">

        <div className="grid gap-6 md:grid-cols-3">
          {/* Profile Card */}
          <Card className="md:col-span-1">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 relative">
                <Avatar className="w-24 h-24 mx-auto">
                  <AvatarImage src={userAvatar || undefined} alt={currentUser.name} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary font-semibold">
                    {currentUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Camera className="h-3 w-3" />
                  </Button>
                  {userAvatar && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 rounded-full"
                      onClick={handleRemoveAvatar}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <CardTitle className="text-xl">{currentUser.name}</CardTitle>
              <CardDescription>LoRA User</CardDescription>
              <div className="flex justify-center gap-2 mt-2">
                <Badge variant="secondary">Free Plan</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Total Users: {users.length}</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
                size="sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Your account details and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Full Name
                    </label>
                    <p className="text-sm font-medium">{currentUser.name}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Email
                    </label>
                    <p className="text-sm font-medium">{currentUser.email}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Account Type
                    </label>
                    <p className="text-sm font-medium">Personal</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Member Since
                    </label>
                    <p className="text-sm font-medium">
                      {new Date(currentUser.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Key Configuration */}
            {/* <ApiKeyConfig /> */}

            {users.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    All Users ({users.length})
                  </CardTitle>
                  <CardDescription>
                    Switch between your accounts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={allUserAvatars[user.id] || undefined} alt={user.name} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Created {new Date(user.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {user.id === currentUser.id && (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Account Settings
                </CardTitle>
                <CardDescription>
                  Manage your account preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">Delete Account</p>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete your account and all associated data
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Data Privacy</p>
                    <p className="text-xs text-muted-foreground">
                      Manage your data and privacy settings
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage Statistics</CardTitle>
                <CardDescription>
                  Your LoRA usage overview
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">0</p>
                    <p className="text-xs text-muted-foreground">AI Conversations</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">0</p>
                    <p className="text-xs text-muted-foreground">Documents Processed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">0</p>
                    <p className="text-xs text-muted-foreground">Models Used</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeletePassword("");
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || !deletePassword.trim()}
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}