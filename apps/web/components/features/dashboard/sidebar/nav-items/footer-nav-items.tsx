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
import Link from "next/link";
import { ChevronsUpDown, CreditCard, LogOut, Sparkles, User } from "lucide-react";
import EditProfileDialog from "./edit-profile-dialog";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";

export default function FooterNavItems() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const entitlement = useOrganizationEntitlement();

  if (!isLoaded) {
    return <SidebarMenuSkeleton />;
  }

  // Show during the trial, or whenever the org lacks a Pro-only module
  // (Lite or expired). Super-admins get full modules, so they never see it.
  const showUpgrade =
    !!entitlement &&
    (entitlement.billingStatus === "trial" ||
      !entitlement.modules.includes("payments"));

  return (
    <>
      {showUpgrade ? (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="bg-[#FF5C24]/10 text-[#FF5C24] hover:bg-[#FF5C24]/15 hover:text-[#FF5C24]"
            >
              <Link href="/dashboard/billing">
                <Sparkles className="size-4" />
                <span>Actualizar a Pro</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : null}
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
              <DropdownMenuItem asChild>
                <Link href="/dashboard/billing">
                  <CreditCard className="mr-2 size-4" />
                  Suscripción
                </Link>
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
