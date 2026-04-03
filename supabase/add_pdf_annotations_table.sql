-- Migration: add pdf_annotations table for as-built markup

create table if not exists pdf_annotations (
    id uuid primary key default gen_random_uuid(),
    print_id uuid references job_prints(id) on delete cascade not null,
    company_id uuid references companies(id) not null,
    author_id uuid references profiles(id) on delete set null,
    author_name text not null,
    page_number integer not null default 1,
    tool_type text not null,
    color text not null default '#ef4444',
    stroke_width integer not null default 4,
    data jsonb not null default '{}',
    created_at timestamp with time zone default now()
);

create index if not exists idx_pdf_annotations_print_id on pdf_annotations(print_id);

alter table pdf_annotations enable row level security;

-- All company members (and super-admins) can view annotations
create policy "pdf_annotations_select" on pdf_annotations
    for select to authenticated
    using (company_id = get_user_company_id());

-- Any authenticated company member can insert their own annotations
create policy "pdf_annotations_insert" on pdf_annotations
    for insert to authenticated
    with check (company_id = get_user_company_id());

-- Authors can delete their own annotations; admins and super-admins can delete any
create policy "pdf_annotations_delete" on pdf_annotations
    for delete to authenticated
    using (
        author_id = auth.uid()
        or is_company_admin()
    );
