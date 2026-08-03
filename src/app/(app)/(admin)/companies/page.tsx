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
import { Building2 } from "lucide-react";
import { CompanyForm } from "./CompanyForm";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteCompany } from "./actions";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "companies",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_manage) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Empresas</h1>
        <CompanyForm />
      </div>
      {(companies ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Building2 className="size-8" />
          <p className="text-sm">No hay empresas todavía.</p>
          <p className="text-xs">Crea la primera con el botón &quot;Nueva empresa&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Nombre</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(companies ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
                    <img src={c.logo_url} alt="" className="size-8 rounded object-contain" />
                  ) : (
                    <Building2 className="size-8 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <CompanyForm initial={{ id: c.id, name: c.name, logo_url: c.logo_url }} />
                    {flags.can_delete && (
                      <DeleteIconButton
                        confirmMessage={`¿Eliminar la empresa "${c.name}"? Esto también eliminará sus departamentos. Esta acción no se puede deshacer.`}
                        action={deleteCompany.bind(null, c.id)}
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
  );
}
