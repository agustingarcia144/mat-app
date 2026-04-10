import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle, Clock, XCircle } from "lucide-react";

type ClassStatus = "scheduled" | "cancelled" | "completed";

function ClassStatusBadge({ status }: { status: ClassStatus }) {
  const getStatusText = (status: ClassStatus): string => {
    switch (status) {
      case "scheduled":
        return "Programada";
      case "cancelled":
        return "Cancelada";
      case "completed":
        return "Completada";
      default:
        return "Desconocido";
    }
  };

  const getVariant = (
    status: ClassStatus,
  ): "success" | "destructive" | "warning" | "outline" => {
    return "outline";
  };

  const Icon =
    status === "scheduled"
      ? Clock
      : status === "cancelled"
        ? XCircle
        : CheckCircle;
  const iconColor =
    status === "scheduled"
      ? "text-amber-500"
      : status === "cancelled"
        ? "text-red-500"
        : status === "completed"
          ? "text-green-500"
          : undefined;

  return (
    <Badge
      variant={getVariant(status)}
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
      {getStatusText(status)}
    </Badge>
  );
}

export default ClassStatusBadge;
