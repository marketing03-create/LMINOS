-- New sign-ups start SWITCHED OFF.
--
-- Supabase creates an auth user for anyone who signs in with Google (the
-- email-code login refuses unknown addresses, Google does not), and this
-- trigger used to give that stranger an ACTIVE app account. Now it is created
-- inactive, so they see "Your account is switched off — ask your admin" and
-- reach nothing. Admins are unaffected: Admin → Users → Add creates the auth
-- user and then upserts the row with is_active = true itself
-- (src/app/api/admin/users/route.ts).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  insert into public.users (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      null
    ),
    'viewer',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
