"use client";
import Link from "next/link";
import { Logo } from "@/components/features/landing/logo";
import { ChevronsUpDown, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";
import { cn } from "@/lib/utils";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInDialog } from "@/components/features/auth/sign-in-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClerk, useUser } from "@clerk/nextjs";

const menuItems = [
  { name: "Funcionalidades", href: "#link", visible: false },
  { name: "Solución", href: "#link", visible: false },
  { name: "Precios", href: "#link", visible: false },
  { name: "Nosotros", href: "#link", visible: false },
];

export const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  return (
    <header>
      <nav
        data-state={menuState && "active"}
        className="fixed z-20 w-full px-2"
      >
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
            isScrolled &&
              "bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5",
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <Link
                href="/"
                aria-label="home"
                className="flex items-center space-x-2"
              >
                <Logo />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? "Cerrar menú" : "Abrir menú"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map(
                  (item, index) =>
                    item.visible && (
                      <li key={index}>
                        <Link
                          href={item.href}
                          className="text-muted-foreground hover:text-accent-foreground block duration-150"
                        >
                          <span>{item.name}</span>
                        </Link>
                      </li>
                    ),
                )}
              </ul>
            </div>

            <div className="bg-background in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground block duration-150"
                      >
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                <Unauthenticated>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(isScrolled && "lg:hidden")}
                    onClick={() => setSignInOpen(true)}
                  >
                    <span>Iniciar sesión</span>
                  </Button>
                  <SignInDialog
                    open={signInOpen}
                    onOpenChange={setSignInOpen}
                  />
                  <Button
                    asChild
                    size="sm"
                    className={cn(isScrolled && "lg:hidden")}
                  >
                    <Link href="/invite-code">
                      <span>Tengo invitacion</span>
                    </Link>
                  </Button>
                </Unauthenticated>
                <Authenticated>
                  <div className="flex items-center gap-2">
                    <Button
                      asChild
                      size="sm"
                      className={cn(isScrolled && "lg:hidden")}
                    >
                      <Link href="/dashboard">
                        <span>Dashboard</span>
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-sm">
                          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                            {user?.fullName?.charAt(0).toUpperCase() ||
                              user?.emailAddresses?.[0]?.emailAddress
                                ?.charAt(0)
                                .toUpperCase() ||
                              "U"}
                          </span>
                          <ChevronsUpDown className="size-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => signOut({ redirectUrl: "/" })}
                        >
                          <LogOut className="mr-2 size-4" />
                          Cerrar sesión
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Authenticated>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};
