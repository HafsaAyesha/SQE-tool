begin;
alter table public.data_sources add column config_encrypted text;
alter table public.data_sources add constraint data_sources_encrypted_size check (config_encrypted is null or char_length(config_encrypted) <= 65536);
comment on column public.data_sources.config_encrypted is 'Versioned AES-256-GCM envelope; URL, auth header and API key are encrypted together. Key is server-only, never in the database.';
commit;
