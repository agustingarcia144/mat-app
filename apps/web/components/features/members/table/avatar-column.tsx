import type { Member } from "@repo/core/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import React from "react";

function AvatarColumn({ member }: { member: Member }) {
  const initials =
    (member.firstName?.[0] || "") + (member.lastName?.[0] || "") ||
    member.name?.[0]?.toUpperCase() ||
    "?";
  return (
    <Avatar className="size-8">
      {member.imageUrl && (
        <AvatarImage src={member.imageUrl} alt={member.name || "User"} />
      )}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

export default AvatarColumn;
