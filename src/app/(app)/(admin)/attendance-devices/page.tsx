import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Fingerprint } from "lucide-react";
import { DeviceForm } from "./DeviceForm";

export default async function AttendanceDevicesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "attendance_devices",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const admin = createAdminClient();
  const { data: devices } = await admin.from("time_clock_devices").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ponchadores</h1>
        <DeviceForm />
      </div>
      {(devices ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Fingerprint className="size-8" />
          <p className="text-sm">No hay ponchadores registrados todavía.</p>
          <p className="text-xs">Crea el primero con el botón &quot;Nuevo ponchador&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(devices ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.ip_address}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? "default" : "secondary"}>
                    {d.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <DeviceForm
                      initial={{
                        id: d.id,
                        name: d.name,
                        ipAddress: d.ip_address,
                        username: d.username,
                        password: d.password,
                        isActive: d.is_active,
                      }}
                    />
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
