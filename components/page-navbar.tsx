"use client";

import { useUser } from "@/components/user-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { DatabaseService } from "@/lib/database";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export function PageNavbar() {
  const { currentUser } = useUser();
  const [userAvatars, setUserAvatars] = useState<Record<string, string | null>>({});

  // Load current user's avatar
  useEffect(() => {
    const loadUserAvatar = async () => {
      if (!currentUser) return;
      
      try {
        const avatar = await DatabaseService.getUserAvatar(currentUser.id, currentUser.password);
        setUserAvatars(prev => ({ ...prev, [currentUser.id]: avatar }));
      } catch (error) {
        console.error('Error loading avatar:', error);
        setUserAvatars(prev => ({ ...prev, [currentUser.id]: null }));
      }
    };

    loadUserAvatar();
  }, [currentUser]);

  if (!currentUser) return null;

  return (
    <div className="flex items-center gap-3">
      <AnimatedThemeToggler />
      <Avatar className="h-9 w-9 border-2 border-primary/20">
        <AvatarImage src={userAvatars[currentUser.id] || undefined} alt={currentUser.name} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
