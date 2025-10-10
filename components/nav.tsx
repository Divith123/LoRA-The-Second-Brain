import Link from "next/link";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { SidebarTrigger } from "./ui/sidebar";
import { useUser } from "./user-context";
import { ModelSelector } from "./model-selector";
import { useModel } from "./app-content";
import { useState, useEffect } from "react";
import { DatabaseService } from "@/lib/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, User, Github } from "lucide-react";

export default function Nav() {
  const { currentUser } = useUser();
  const { currentModel, onModelChange } = useModel();
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Load current user's avatar
  useEffect(() => {
    const loadUserAvatar = async () => {
      if (!currentUser) return;

      try {
        const avatar = await DatabaseService.getUserAvatar(currentUser.id, currentUser.password);
        setUserAvatar(avatar);
      } catch (error) {
        console.error('Error loading avatar:', error);
        setUserAvatar(null);
      }
    };

    loadUserAvatar();
  }, [currentUser]);

  return (
    <nav className="fixed flex w-full items-center bg-background p-6 md:bg-transparent z-40">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="h-8 w-8" />
     <ModelSelector currentModel={currentModel} onModelChange={onModelChange} />
      </div>

      {/* Fixed right side elements */}
      <div className="fixed right-6 top-6 flex items-center gap-4">
        {/* Lightbulb theme toggle */}
        <div className="flex items-center justify-center">
          <AnimatedThemeToggler />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="cursor-pointer h-10 w-10 hover:ring-2 hover:ring-primary/50 transition-all">
              <AvatarImage src={userAvatar || undefined} alt={currentUser?.name || "User"} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover/95 backdrop-blur-sm border-border/50 rounded-2xl shadow-xl p-3 min-w-[180px]">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 w-full justify-start text-sm h-9 rounded-xl hover:bg-muted/80">
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href="https://github.com/Divith123/LoRA-The-Second-Brain"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full justify-start text-sm h-9 rounded-xl hover:bg-muted/80"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
