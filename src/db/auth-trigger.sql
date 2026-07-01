-- Auto-mirror auth.users → public.users when someone logs in for the
-- first time via Google SSO. Paste once into Supabase → SQL Editor.
--
-- Behavior:
--   * On INSERT into auth.users, we create a matching row in public.users
--     with the same id, the email from auth, and default role = 'viewer'
--     (admins promote to sales_agent / team_lead / hq_admin manually).
--   * If you re-run this script, it drops + recreates the trigger safely.

create or replace function public.handle_new_auth_user()
returns trigger as $$
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
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
