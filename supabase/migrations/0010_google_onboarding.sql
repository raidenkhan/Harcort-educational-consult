-- ============================================================================
-- Harcourt Educational Consult — 0010: one-time Google onboarding
--
-- The Google flow no longer asks for a role BEFORE the redirect (that picker
-- is gone from both auth tabs). Instead the callback checks whether the
-- Google email already has an account:
--
--   * NEW account  → onboarding_completed_at stays NULL → the user lands on
--                    /onboarding and picks student or tutor once.
--   * EXISTING     → the RPC stamps onboarding_completed_at = now() when it
--                    links the Google id to the existing account → the user
--                    goes straight to /dashboard, role untouched.
--
-- Existing rows are backfilled so no current user ever sees the onboarding
-- screen. Apply: Supabase SQL Editor. (Safe to re-run, with one caveat: the
-- backfill stamps every row that is still NULL — don't re-run it while a
-- brand-new Google user is mid-onboarding, or they'd skip the role pick.)
-- ============================================================================

-- 1) The one-time-onboarding stamp.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill: everyone who already has an account has "done" onboarding.
update public.profiles
  set onboarding_completed_at = now()
  where onboarding_completed_at is null;

-- 2) upsert_google_user — same as 0009, except the LINK branch (an existing
--    email/password account) stamps onboarding_completed_at so the callback
--    knows this is a returning user. The CREATE branch leaves it null.
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
  --     onboarding_completed_at is left untouched: a brand-new Google-only
  --     account that hasn't finished onboarding still needs the prompt.
  select profile_id into v_profile_id
    from public.credentials
    where google_id = p_google_id
    limit 1;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  -- (b) Email already registered (an email/password account) → link the
  --     Google id to it. The user keeps their role, sessions and chats, and
  --     onboarding is marked done — they're clearly a returning user.
  select profile_id into v_profile_id
    from public.credentials
    where email = lower(trim(p_email))
    limit 1;

  if v_profile_id is not null then
    update public.credentials
      set google_id = p_google_id, updated_at = now()
      where profile_id = v_profile_id;

    update public.profiles
      set avatar_url = coalesce(p_avatar_url, avatar_url),
          onboarding_completed_at = now()
      where id = v_profile_id;

    return v_profile_id;
  end if;

  -- (c) Brand-new account → onboarding_completed_at stays NULL so the
  --     callback sends the user to /onboarding for the one-time role pick.
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

-- 3) register_user (email sign-up) stamps onboarding_completed_at too — an
--    email sign-up picks their role in the form, so onboarding is done the
--    moment the account exists. Keeps the invariant "NULL ⟺ brand-new
--    Google account awaiting its one-time role pick" true for every profile.
create or replace function public.register_user(
  p_email         text,
  p_password_hash text,
  p_full_name     text default '',
  p_role          public.user_role default 'student'
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_id     uuid := gen_random_uuid();
  final_role public.user_role := p_role;
begin
  if final_role = 'admin' then
    final_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role, onboarding_completed_at)
  values (new_id, coalesce(nullif(trim(p_full_name), ''), ''), final_role, now());

  insert into public.credentials (profile_id, email, password_hash)
  values (new_id, lower(trim(p_email)), p_password_hash);

  return new_id;
end;
$$;
