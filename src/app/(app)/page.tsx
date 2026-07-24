import { createClient } from "@/lib/supabase/server";
import { getUpcomingBirthdays, type BirthdayContact } from "@/lib/contacts";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });

  let birthdayContacts: BirthdayContact[] = [];
  if (flagsRows?.[0]?.can_view) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, birth_date")
      .eq("status", "active");

    birthdayContacts = getUpcomingBirthdays(
      (contacts ?? []).map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        birth_date: c.birth_date,
      })),
      new Date(),
      5,
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-md space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Bienvenido</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <BirthdaysWidget contacts={birthdayContacts} />
    </div>
  );
}
