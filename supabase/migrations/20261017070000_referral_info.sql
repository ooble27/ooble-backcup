-- Page d'invitation (lien de parrainage ooble.ca/i/CODE), ouverte sans compte : le prénom du parrain
-- et l'avantage offert. Rien d'autre sur le parrain n'est montré.
create or replace function public.referral_info(_code text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  g record;
  nm text;
begin
  select * into g from public.growth_settings where id = 1;
  select split_part(trim(coalesce(p.full_name, '')), ' ', 1) into nm
    from public.referral_codes c join public.profiles p on p.id = c.user_id
   where c.code = upper(trim(coalesce(_code, ''))) and p.closed_at is null;
  if not found then
    return jsonb_build_object('valid', false, 'enabled', coalesce(g.referral_enabled, false));
  end if;
  return jsonb_build_object(
    'valid', true,
    'enabled', coalesce(g.referral_enabled, false),
    'first_name', nullif(nm, ''),
    'bonus_bps', least(coalesce(g.referral_bonus_bps, 0), coalesce(g.max_bonus_bps, 150))
  );
end;
$function$;
revoke execute on function public.referral_info(text) from public;
grant execute on function public.referral_info(text) to anon, authenticated;
