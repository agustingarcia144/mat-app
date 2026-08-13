"use client";

import React from "react";
import Link from "next/link";
import { ModeToggle } from "@/components/shared/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useDashboardBreadcrumbs } from "@/hooks/use-current-page-title";

function HeaderSection() {
  const breadcrumbs = useDashboardBreadcrumbs();
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:rounded-t-xl">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-6"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.href ?? crumb.label}>
                  <BreadcrumbItem
                    className={isLast ? undefined : "hidden md:block"}
                  >
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage className="line-clamp-1 text-lg font-medium">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild className="text-lg font-medium">
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && (
                    <BreadcrumbSeparator className="hidden md:block" />
                  )}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <ModeToggle />
    </header>
  );
}

export default HeaderSection;
