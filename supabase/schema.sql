-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. Create the files metadata table
create table files (
  id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
      name text not null,
        storage_path text not null,
          size bigint not null,
            mime_type text not null,
              created_at timestamptz default now() not null
              );

              -- 2. Enable Row Level Security
              alter table files enable row level security;

              -- 3. RLS policies: users can only access their own rows
              create policy "select_own_files" on files
                for select using (auth.uid() = user_id);

                create policy "insert_own_files" on files
                  for insert with check (auth.uid() = user_id);

                  create policy "delete_own_files" on files
                    for delete using (auth.uid() = user_id);

                    -- -------------------------------------------------------
                    -- Storage bucket setup (do this in Supabase Dashboard):
                    -- Storage > New bucket > Name: "files" > Private (unchecked public) > Save
                    -- Then add these storage policies in Storage > files bucket > Policies:
                    -- -------------------------------------------------------

                    -- Storage: allow users to upload to their own folder
                    create policy "upload_own_files" on storage.objects
                      for insert with check (
                          bucket_id = 'files'
                              and auth.uid()::text = (storage.foldername(name))[1]
                                );

                                -- Storage: allow users to read their own files
                                create policy "read_own_files" on storage.objects
                                  for select using (
                                      bucket_id = 'files'
                                          and auth.uid()::text = (storage.foldername(name))[1]
                                            );

                                            -- Storage: allow users to delete their own files
                                            create policy "delete_own_storage_files" on storage.objects
                                              for delete using (
                                                  bucket_id = 'files'
                                                      and auth.uid()::text = (storage.foldername(name))[1]
                                                        );
                                                        