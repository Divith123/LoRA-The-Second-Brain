"use client";

import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUser } from "@/components/user-context";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettingsModal } from "@/components/settings-modal";

export function NavUser() {
  const { users, currentUser, logout, switchUser } = useUser();
  const { isMobile } = useSidebar();
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  // ✨ FIX: Declare the 'error' state variable and its setter function
  const [error, setError] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  if (!currentUser) return null;

  const handleLogout = () => {
    logout();
  };

  const handleUserSwitch = (userId: string) => {
    if (userId === currentUser.id) return; // Already current user
    setSelectedUserId(userId);
    setPassword("");
    setError("");
    setShowSwitchDialog(true);
  };

  const handleSwitchConfirm = async () => {
    if (!password.trim()) return;

    setIsSwitching(true);
    setError("");

    try {
      const success = await switchUser(selectedUserId, password.trim());
      if (success) {
        setShowSwitchDialog(false);
        window.location.reload(); // Force reload to update UI
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    }

    setIsSwitching(false);
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src="/avatars/user.jpg" alt={currentUser.name} />
                  <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold">
                    {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{currentUser.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src="/avatars/user.jpg" alt={currentUser.name} />
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold">
                      {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{currentUser.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {users.length > 1 && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                      Switch User
                    </DropdownMenuLabel>
                    {users.filter(u => u.id !== currentUser.id).map((user) => (
                      <DropdownMenuItem
                        key={user.id}
                        onClick={() => handleUserSwitch(user.id)}
                        className="flex items-center gap-2"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-muted">
                            {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{user.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Upgrade to Pro
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <User className="h-4 w-4 mr-2" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSettingsModal(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="h-4 w-4 mr-2" />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Switch to {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              Enter the password to switch to this user account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="switch-password">Password</Label>
              <Input
                id="switch-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSwitchDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSwitchConfirm} disabled={!password.trim() || isSwitching}>
                {isSwitching ? "Switching..." : "Switch User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </>
  );
}
