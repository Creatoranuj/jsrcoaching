
-- doubt_replies table
create table public.doubt_replies (
  id uuid primary key default gen_random_uuid(),
  doubt_session_id uuid references public.doubt_sessions(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  message text not null,
  is_ai boolean default false,
  created_at timestamptz default now()
);

alter table public.doubt_replies enable row level security;

create policy "Users can read replies for their sessions"
  on public.doubt_replies for select to authenticated
  using (
    user_id = auth.uid()
    or doubt_session_id in (
      select id from public.doubt_sessions where student_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'teacher')
  );

create policy "Authenticated users can insert replies"
  on public.doubt_replies for insert to authenticated
  with check (user_id = auth.uid());
