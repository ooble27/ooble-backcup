alter table public.saved_recipients
  add constraint sender_requires_network check (kind <> 'sender' or network is not null);

create unique index if not exists saved_recipients_sender_uniq
  on public.saved_recipients (user_id, value, network)
  where kind = 'sender';
