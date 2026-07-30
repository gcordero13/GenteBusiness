import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", user?.email ?? "")
    .maybeSingle();

  if (contact) {
    redirect(`/contacts/${contact.id}`);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Mi perfil</h1>
      <p className="text-sm text-muted-foreground">
        No encontramos un contacto en la agenda vinculado a tu correo. Pide a un administrador que
        te agregue.
      </p>
    </div>
  );
}
