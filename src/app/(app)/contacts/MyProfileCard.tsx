import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatTenure, getInitials } from "@/lib/contacts";

export interface MyProfileCardData {
  name: string;
  position: string | null;
  photo_url: string | null;
  hire_date: string | null;
}

export function MyProfileCard({ data, today }: { data: MyProfileCardData; today: Date }) {
  const tenure = data.hire_date ? formatTenure(data.hire_date, today) : null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 flex w-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 text-center duration-700">
      <Avatar className="size-28 border-2 border-[#04B1AF] shadow-sm">
        <AvatarImage src={data.photo_url ?? undefined} alt="" />
        <AvatarFallback className="text-2xl">{getInitials(data.name)}</AvatarFallback>
      </Avatar>
      <p className="mt-3 max-w-[200px] truncate text-base font-semibold">{data.name}</p>
      {data.position && (
        <p className="max-w-[200px] truncate text-sm text-muted-foreground">{data.position}</p>
      )}
      {tenure && (
        <div className="mt-2 w-full border-t pt-2 text-xs">
          <span className="text-muted-foreground">Tiempo en la empresa</span>
          <p className="font-medium">{tenure}</p>
        </div>
      )}
    </div>
  );
}
