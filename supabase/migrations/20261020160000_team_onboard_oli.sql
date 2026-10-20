-- Accueil d'un nouveau membre : les tâches de démarrage viennent d'Oli, et la prise en main
-- « Vérification » suit le travail actuel (rapport d'Oli, 6 points à cocher). Rien d'autre ne change.

create or replace function public.team_onboard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  due date := (now() at time zone 'America/Toronto')::date + 7;
  by_id uuid := coalesce(auth.uid(), new.user_id);
  -- Les tâches d'accueil viennent d'Oli (nom choisi dans Réglages › Oli).
  by_name text := coalesce((select name from public.oli_settings where id = 1), 'Oli');
  r text := new.role::text;
  t_title text;
  t_steps text[];
begin
  -- Premiers pas, une seule fois par compte.
  insert into public.team_onboarding_done (user_id, topic) values (new.user_id, 'general') on conflict do nothing;
  if found then
    insert into public.team_tasks (title, details, assignee_id, due_on, created_by, created_by_name, steps)
    values ('Bienvenue chez Ooble : vos premiers pas',
      'Quelques minutes pour prendre vos repères. Cochez chaque étape une fois faite.',
      new.user_id, due, by_id, by_name,
      (select jsonb_agg(jsonb_build_object('text', s, 'done', false)) from unnest(array[
        'Compléter mon profil d''équipe (avatar, couleur, statut)',
        'Activer les notifications sur mon téléphone (Mon profil d''équipe)',
        'Lire le manuel de l''équipe (Aide › Manuel)',
        'Lire les messages épinglés dans Notes à l''équipe',
        'Me présenter à l''équipe dans la messagerie'
      ]) s));
  end if;

  -- Prise en main du poste, une fois par rôle.
  insert into public.team_onboarding_done (user_id, topic) values (new.user_id, r) on conflict do nothing;
  if not found then return new; end if;
  case r
    when 'operator' then
      t_title := 'Prise en main : commandes';
      t_steps := array['Lire les procédures d''achat et de vente dans le manuel', 'Suivre une commande de test du début à la fin',
        'Prendre une commande dans la file d''attente', 'Vérifier un dépôt Interac et le rattacher à sa commande', 'Faire une passation de fin de journée dans Mon espace'];
    when 'compliance' then
      t_title := 'Prise en main : conformité';
      t_steps := array['Lire la politique de conformité et les obligations envers le CANAFE', 'Ouvrir la page Conformité et parcourir une alerte',
        'Consulter le registre d''un client', 'Savoir quand demander une approbation à un administrateur'];
    when 'kyc_reviewer' then
      t_title := 'Prise en main : vérification d''identité';
      t_steps := array['Lire la fiche « Examiner une vérification d''identité » dans la Base de connaissances',
        'Ouvrir un dossier dans Vérifications et lire le rapport d''Oli sous chaque point',
        'Comparer vous-même le visage du selfie à la photo de la pièce : Oli ne le fait pas',
        'Cocher les 6 points après les avoir regardés, puis approuver, ou refuser avec un motif clair pour le client'];
    when 'accounting' then
      t_title := 'Prise en main : comptabilité';
      t_steps := array['Parcourir le plan comptable et le journal', 'Ouvrir la Trésorerie et les photos du stock',
        'Faire un rapprochement Desjardins de test', 'Lire la procédure de clôture du mois'];
    when 'support' then
      t_title := 'Prise en main : support';
      t_steps := array['Lire les réponses types de la Messagerie', 'Ouvrir la fiche d''un client et son historique',
        'Répondre à un message de test', 'Savoir à qui transmettre une demande sensible'];
    when 'marketing' then
      t_title := 'Prise en main : marketing';
      t_steps := array['Lire les règles du Centre de contrôle (rien ne part sans les interrupteurs)', 'Parcourir les modèles de campagnes',
        'Préparer une campagne de test sans l''envoyer', 'Consulter les statistiques des dernières campagnes'];
    else
      return new;
  end case;
  insert into public.team_tasks (title, details, assignee_id, due_on, created_by, created_by_name, steps)
  values (t_title, 'Les bases du poste. Demandez à l''équipe dans la messagerie au moindre doute.', new.user_id, due, by_id, by_name,
    (select jsonb_agg(jsonb_build_object('text', s, 'done', false)) from unnest(t_steps) s));
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.team_onboard() from public, anon, authenticated;
