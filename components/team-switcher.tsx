"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string;
    logo?: React.ElementType;
    plan: string;
  }[];
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [activeTeam, setActiveTeam] = React.useState(teams[0]);

  const handleClick = () => {
    // Navigate to About page for LoRA project
    router.push('/about');
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          onClick={handleClick}
          className="cursor-pointer"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
            {activeTeam.logo && <activeTeam.logo className="size-4" />}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight pl-0 ml-[-8px]">
            <span className="truncate font-semibold flex items-center min-h-[32px]">
              {activeTeam.name}
            </span>
            <span className="truncate text-xs">{activeTeam.plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}