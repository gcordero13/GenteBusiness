import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";

export interface SolicitudesProfileHeaderProps {
  name: string;
  position: string | null;
  photoUrl: string | null;
  tenure: string | null;
}

export function SolicitudesProfileHeader({ name, position, photoUrl, tenure }: SolicitudesProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border p-4">
      <Avatar className="size-14">
        <AvatarImage src={photoUrl ?? undefined} alt="" />
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="font-semibold">{name}</p>
        {(position || tenure) && (
          <p className="text-sm text-muted-foreground">
            {position}
            {position && tenure ? " · " : ""}
            {tenure && `${tenure} en la empresa`}
          </p>
        )}
      </div>
    </div>
  );
}
