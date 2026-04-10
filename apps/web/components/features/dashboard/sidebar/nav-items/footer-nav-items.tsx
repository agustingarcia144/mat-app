import React, { useState } from "react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClerk, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { ChevronsUpDown, LogOut, User } from "lucide-react";
import EditProfileDialog from "./edit-profile-dialog";

export default function FooterNavItems() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  if (!isLoaded) {
    return <SidebarMenuSkeleton />;
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                  {user?.imageUrl ? (
                    <Image
                      src={user.imageUrl}
                      alt={user?.fullName || "User"}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <span className="text-xs font-semibold">
                        {user?.fullName?.charAt(0).toUpperCase() ||
                          user?.emailAddresses?.[0]?.emailAddress
                            ?.charAt(0)
                            .toUpperCase() ||
                          "U"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight max-w-42">
                  <span className="truncate font-semibold">
                    {user?.fullName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.emailAddresses?.[0]?.emailAddress}
                  </span>
                </div>
                <ChevronsUpDown className="size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setIsProfileDialogOpen(true);
                }}
              >
                <User className="mr-2 size-4" />
                Editar perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
                <LogOut className="mr-2 size-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <EditProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
      />
    </>
  );
}
