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
import { Network } from "lucide-react";
import { DepartmentForm } from "./DepartmentForm";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteDepartment } from "./actions";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "departments",
  });
  const flags = flagsRows?.[0];
  if (!flags?.can_manage) {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id, companies(name)")
    .order("name");
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Departamentos</h1>
        <DepartmentForm companies={companies ?? []} />
      </div>
      {(departments ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Network className="size-8" />
          <p className="text-sm">No hay departamentos todavía.</p>
          <p className="text-xs">Crea el primero con el botón &quot;Nuevo departamento&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(departments ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{(d.companies as unknown as { name: string })?.name}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <DepartmentForm
                      companies={companies ?? []}
                      initial={{ id: d.id, name: d.name, companyId: d.company_id }}
                    />
                    {flags.can_delete && (
                      <DeleteIconButton
                        confirmMessage={`¿Eliminar el departamento "${d.name}"? Esta acción no se puede deshacer.`}
                        action={deleteDepartment.bind(null, d.id)}
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
