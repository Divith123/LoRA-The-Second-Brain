import Link from "next/link";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { SidebarTrigger } from "./ui/sidebar";
import { useUser } from "./user-context";
import { ModelSelector } from "./model-selector";
import { useModel } from "./app-content";
import { useState, useEffect } from "react";
import { useDeepSecure } from "./app-content";
import { DatabaseService } from "@/lib/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { ChevronDown } from "lucide-react";
import { ExternalLink, User, Github, ArrowLeft, Image as ImageIcon, Video as VideoIcon, Music } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Nav({ showSidebar = true, showMediaSelector = false }: { showSidebar?: boolean; showMediaSelector?: boolean }) {
  const { currentUser } = useUser();
  const { currentModel, onModelChange } = useModel();
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const router = useRouter();
  // Use shared deep secure media type state so the page and navbar stay in sync
  const { mediaType, setMediaType } = useDeepSecure();
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
        {showSidebar ? (
          <SidebarTrigger className="h-8 w-8" />
        ) : (
          <button
            type="button"
            aria-label="Back to chats"
            onClick={() => router.push('/')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {showMediaSelector ? (
          <div className="ml-2">
            <label className="sr-only">Media type</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-8 px-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <span className="max-w-[140px] truncate font-semibold">{mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}</span>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[160px] bg-popover border-border rounded-2xl shadow-xl p-1">
                <DropdownMenuItem asChild>
                  <button className="flex items-center gap-2 w-full justify-start text-sm h-9 rounded-xl px-3 hover:bg-muted/80" onClick={() => setMediaType('image')}>
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    Image
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <button className="flex items-center gap-2 w-full justify-start text-sm h-9 rounded-xl px-3 hover:bg-muted/80" onClick={() => setMediaType('video')}>
                    <VideoIcon className="h-4 w-4 text-muted-foreground" />
                    Video
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <button className="flex items-center gap-2 w-full justify-start text-sm h-9 rounded-xl px-3 hover:bg-muted/80" onClick={() => setMediaType('audio')}>
                    <Music className="h-4 w-4 text-muted-foreground" />
                    Audio
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <ModelSelector currentModel={currentModel} onModelChange={onModelChange} />
        )}
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
