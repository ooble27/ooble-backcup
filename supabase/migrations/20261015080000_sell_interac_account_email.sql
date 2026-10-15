-- Ventes : le virement Interac part toujours vers le courriel du compte du client.
-- Le client ne choisit plus de courriel de réception : impossible de faire verser l'argent d'une vente
-- sur le compte d'une autre personne. La base impose le courriel du compte, quoi que l'app envoie.
-- Quand un client change son courriel de connexion, son dossier (profiles.email) suit.

create or replace function public.orders_note_wallets()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fam text := public.wallet_family(new.network);
  account_email text;
begin
  if tg_op = 'INSERT' and new.side = 'sell' then
    select u.email into account_email from auth.users u where u.id = new.user_id;
    new.interac_email := coalesce(nullif(trim(account_email), ''), new.interac_email);
    new.sender_address := nullif(trim(coalesce(new.sender_address, '')), '');
    new.sender_platform := nullif(left(trim(coalesce(new.sender_platform, '')), 60), '');
    new.client_tx_hash := null;
    new.client_sent_at := null;
    if new.sender_address is not null and new.network is not null and not public.wallet_format_ok(fam, new.sender_address) then
      raise exception 'L''adresse d''envoi n''a pas le bon format pour ce réseau.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
create or replace trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_profile_email();
