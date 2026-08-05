import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Newspaper, PartyPopper } from "lucide-react";
import { formatMonthDay } from "@/lib/contacts";
import { ActivityForm } from "./ActivityForm";
import { NewsForm } from "./NewsForm";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteActivity, deleteNews } from "./actions";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "activities",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_manage) {
    redirect("/");
  }

  const { data: events } = await supabase
    .from("company_events")
    .select("*")
    .order("event_date");

  const { data: news } = await supabase
    .from("company_news")
    .select("*")
    .order("start_date", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-10 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Actividades y días de fiesta</h1>
          <ActivityForm />
        </div>
        {(events ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <PartyPopper className="size-8" />
            <p className="text-sm">No hay actividades todavía.</p>
            <p className="text-xs">Crea la primera con el botón &quot;Nueva actividad&quot;.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(events ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{formatMonthDay(e.event_date)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <ActivityForm initial={{ id: e.id, name: e.name, eventDate: e.event_date }} />
                      {flags.can_delete && (
                        <DeleteIconButton
                          confirmMessage={`¿Eliminar la actividad "${e.name}"? Esta acción no se puede deshacer.`}
                          action={deleteActivity.bind(null, e.id)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Noticias y eventos</h1>
          <NewsForm />
        </div>
        {(news ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <Newspaper className="size-8" />
            <p className="text-sm">No hay noticias todavía.</p>
            <p className="text-xs">Crea la primera con el botón &quot;Nueva noticia&quot;.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(news ?? []).map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell>
                    {formatMonthDay(n.start_date)} - {formatMonthDay(n.end_date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <NewsForm
                        initial={{
                          id: n.id,
                          title: n.title,
                          description: n.description,
                          imageUrl: n.image_url,
                          linkUrl: n.link_url,
                          startDate: n.start_date,
                          endDate: n.end_date,
                        }}
                      />
                      {flags.can_delete && (
                        <DeleteIconButton
                          confirmMessage={`¿Eliminar la noticia "${n.title}"? Esta acción no se puede deshacer.`}
                          action={deleteNews.bind(null, n.id)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
