-- ============================================================================
-- Harcourt Educational Consult — Google sign-in
-- Slots "Sign in with Google" into the self-hosted auth (0003) WITHOUT
-- bringing back Supabase Auth:
--   1. credentials gains a nullable google_id (Google's immutable `sub`)
--   2. password_hash becomes nullable (Google-only accounts have no password)
--   3. upsert_google_user RPC — atomic find-or-link-or-create by Google id,
--      then by email (a Google sign-in on an existing email/password account
--      LINKS the two — the user keeps their profile, sessions, chats), and
--      only creates a fresh profile when neither matches.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- The app calls upsert_google_user from /api/auth/google/callback.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Google identity on credentials. Partial unique index: at most one row
--    per Google account; NULLs (password-only users) don't collide.
-- ---------------------------------------------------------------------------
alter table public.credentials
  add column if not exists google_id text;

create unique index if not exists idx_credentials_google_id
  on public.credentials (google_id)
  where google_id is not null;

-- Google-only accounts have no scrypt hash. Email/password sign-in on such a
-- row naturally fails (sign-in treats a missing hash as a dummy burn).
alter table public.credentials
  alter column password_hash drop not null;

-- ---------------------------------------------------------------------------
-- 2) upsert_google_user — atomic find-or-link-or-create.
--    Returns the acting profile id. Never allows self-promotion to admin.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_google_user(
  p_email        text,
  p_google_id    text,
  p_full_name    text default '',
  p_avatar_url   text default null,
  p_role         public.user_role default 'student'
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_final_role public.user_role := p_role;
begin
  if v_final_role = 'admin' then
    v_final_role := 'student';
  end if;

  -- (a) Already linked to this Google identity → just return the profile.
  select profile_id into v_profile_id
    from public.credentials
    where google_id = p_google_id
    limit 1;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  -- (b) Email already registered (an email/password account) → link the
  --     Google id to it. The user keeps their role, sessions and chats.
  select profile_id into v_profile_id
    from public.credentials
    where email = lower(trim(p_email))
    limit 1;

  if v_profile_id is not null then
    update public.credentials
      set google_id = p_google_id, updated_at = now()
      where profile_id = v_profile_id;

    update public.profiles
      set avatar_url = coalesce(p_avatar_url, avatar_url)
      where id = v_profile_id;

    return v_profile_id;
  end if;

  -- (c) Brand-new account.
  v_profile_id := gen_random_uuid();

  insert into public.profiles (id, full_name, role, avatar_url)
  values (
    v_profile_id,
    coalesce(nullif(trim(p_full_name), ''), ''),
    v_final_role,
    p_avatar_url
  );

  insert into public.credentials (profile_id, email, password_hash, google_id)
  values (v_profile_id, lower(trim(p_email)), null, p_google_id);

  return v_profile_id;
exception
  -- Race: two concurrent upserts for the same brand-new identity both missed
  -- the lookups above and one hit the unique index. Re-resolve and return the
  -- winner's profile id instead of surfacing 23505 to the app.
  when unique_violation then
    select profile_id into v_profile_id
      from public.credentials
      where google_id = p_google_id
      limit 1;

    if v_profile_id is null then
      select profile_id into v_profile_id
        from public.credentials
        where email = lower(trim(p_email))
        limit 1;
    end if;

    if v_profile_id is null then
      raise;
    end if;

    return v_profile_id;
end;
$$;
