import React from "react";
import { ClassesEmptyStateCard } from "./classes-empty-state-card";

interface ClassesEmptyStateProps {
  paddingBottom: number;
  title?: string;
  subtext?: string;
}

export function ClassesEmptyState({
  paddingBottom,
  title = "No tienes reservas",
  subtext = "Reservá tu lugar en las próximas clases",
}: ClassesEmptyStateProps) {
  return (
    <ClassesEmptyStateCard
      title={title}
      subtext={subtext}
      paddingBottom={paddingBottom}
    />
  );
}
