-- Vérification d'identité interne : les fiches ne parlent plus de Sumsub.
-- L'équipe examine chaque dossier dans le back-office ; Oli le lit avant elle et écrit son rapport.

do $$ begin
update public.kb_articles set updated_at = now(), body = $b$Ouvrez **Vérifications → À vérifier**, puis un dossier. Le client a envoyé sa pièce d'identité (recto, et verso pour une carte), un selfie et une preuve d'adresse.

## Le rapport d'Oli

Quelques secondes après l'envoi, Oli lit la pièce et la preuve d'adresse, puis les compare à ce que le client a déclaré. Une ligne en haut des contrôles dit où il en est ; sous chaque point, une note commence par « Oli » :

| Couleur de « Oli » | Sens |
| --- | --- |
| Vert | L'information lue correspond |
| Jaune | Oli a vu un écart : lisez sa note avant de décider |
| Gris | Oli n'a pas pu lire ce point, ou ne le fait pas (les visages) : à vous |

Sous la liste, **Oli a aussi remarqué** signale le type de pièce lu, les chiffres de contrôle d'un passeport et une pièce déjà utilisée par un autre compte.

Oli ne décide jamais : il prépare le dossier, vous approuvez ou refusez. S'il n'a pas de rapport ou n'a pas pu lire, cliquez **Lancer l'analyse** ou **Relancer l'analyse**.

## Vos contrôles

Cochez chaque contrôle après l'avoir fait vous-même, même quand Oli est d'accord :

- [ ] Le visage du selfie correspond à la photo de la pièce.
- [ ] Le nom correspond à celui du compte.
- [ ] La date de naissance correspond à celle déclarée.
- [ ] La pièce n'est pas expirée.
- [ ] Les photos sont nettes et complètes.
- [ ] La preuve d'adresse a moins de 3 mois, au nom du client et à l'adresse déclarée.

Le lien **Cocher les points qu'Oli a confirmés** coche d'un coup les points en vert : ne l'utilisez qu'après avoir regardé les documents.

**Approuver** n'est proposé directement que si tous les contrôles sont cochés ; sinon le bouton devient « Approuver quand même », à utiliser seulement avec une bonne raison.

Pour **Refuser**, choisissez un motif prêt à l'emploi ou écrivez le vôtre dans **Motif pour le client** : le client le reçoit par courriel. Écrivez ce qu'il doit faire, par exemple « Reprenez la photo de votre pièce en pleine lumière ».

Les boutons **Précédent** et **Suivant** passent d'un dossier à l'autre sans revenir à la liste.$b$
where id = '05f00d4e-7d51-482a-975a-a5edef2b75d5';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$Le client fait sa vérification dans l'app : photo de sa pièce d'identité, puis selfie. Le service Sumsub contrôle l'authenticité de la pièce et compare le visage ; son verdict revient automatiquement dans Ooble. Les dossiers qui demandent un regard humain arrivent dans **Vérifications → À vérifier**.

Pour chaque dossier, l'examinateur coche quatre contrôles après les avoir faits :

1. Le visage du selfie correspond à la photo de la pièce.
2. Le nom correspond à celui du compte.
3. La pièce n'est pas expirée.
4. Les photos sont nettes et complètes.

**Approuver** n'est proposé directement que si les quatre contrôles sont cochés.$o$,
$n$Le client fait sa vérification dans l'app : il déclare son nom et sa date de naissance, photographie sa pièce d'identité (recto, et verso pour une carte), prend un selfie et ajoute une preuve d'adresse. Tout est rangé dans le stockage privé d'Ooble et le dossier arrive dans **Vérifications → À vérifier**. La vérification est faite entièrement par Ooble : aucun fournisseur externe ne décide.

### La pré-analyse d'Oli

Dès l'arrivée du dossier, Oli, l'assistant de l'équipe, lit la pièce et la preuve d'adresse et les compare à la déclaration du client : nom, date de naissance et âge, date d'expiration, netteté, type de pièce, chiffres de contrôle d'un passeport, preuve d'adresse récente et au bon nom, même pièce déjà utilisée par un autre compte. Son rapport s'affiche dans le dossier, sous chaque point à vérifier ; il n'apparaît pas dans la fiche client.

Oli ne compare pas les visages et ne décide jamais : il prépare le travail, l'examinateur approuve ou refuse. Un administrateur peut couper la lecture automatique dans **Réglages → Analyse d'Oli** ; l'équipe peut alors la lancer à la main depuis un dossier. Les documents sont lus par le modèle d'IA d'Anthropic ; le selfie ne lui est pas transmis.

### Les contrôles de l'examinateur

Pour chaque dossier, l'examinateur coche six contrôles après les avoir faits lui-même :

1. Le visage du selfie correspond à la photo de la pièce.
2. Le nom correspond à celui du compte.
3. La date de naissance correspond à celle déclarée.
4. La pièce n'est pas expirée.
5. Les photos sont nettes et complètes.
6. La preuve d'adresse a moins de 3 mois, au nom du client et à l'adresse déclarée.

Un point qu'Oli signale « à regarder » demande une attention particulière, jamais un refus automatique. **Approuver** n'est proposé directement que si tous les contrôles sont cochés.$n$)
where id = 'f3742fd5-7c0b-4dd7-895c-b5398de48a7b';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(replace(body,
$o$| Selfie | Comparaison automatique avec la photo de la pièce | Idem |$o$,
$n$| Selfie | Comparé par l'équipe à la photo de la pièce | Idem |
| Preuve d'adresse | Document de moins de 3 mois, au nom du client | Idem |$n$),
$o$| Examen | Sumsub, puis équipe si besoin | Équipe Ooble |$o$,
$n$| Examen | Pré-analyse d'Oli, puis équipe Ooble | Équipe Ooble |$n$)
where id = 'a71fc420-bf46-49f9-9b2e-be236811676e';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$| Sumsub | Vérifications suspendues | Bannière si la panne dure |$o$,
$n$| Anthropic | Pas de rapport d'Oli sur les dossiers | Examiner les dossiers sans son rapport |$n$)
where id = '58c1e899-7fbf-4848-8440-31f1bfa3f196';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$| Vérification des signatures (Interac, Sumsub, Resend) | Qu'un faux avis de paiement ou un faux résultat de vérification soit accepté |$o$,
$n$| Vérification des signatures (Interac, Resend) | Qu'un faux avis de paiement ou un faux événement de courriel soit accepté |$n$)
where id = '79479b63-eb35-44bb-8839-013c3614ee8b';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$Les pièces d'identité sont aussi traitées par Sumsub pour la vérification.$o$,
$n$Pour préparer l'examen, la pièce d'identité et la preuve d'adresse sont lues par Oli, l'assistant de l'équipe, au moyen du modèle d'IA d'Anthropic ; elles ne servent pas à entraîner de modèle. Le selfie n'est pas transmis.$n$)
where id = 'de09bf55-996b-4c41-9d4b-e7c845ec361f';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$| Sumsub | Vérification d'identité | Nouvelles vérifications suspendues | Les clients déjà vérifiés continuent |$o$,
$n$| Anthropic | Assistants, pré-analyse des dossiers par Oli | Pas de rapport d'Oli | L'équipe examine les dossiers sans lui |$n$)
where id = '99fe1277-2f8d-4cef-acc7-b184c9ca29ca';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(replace(body,
$o$| Logique serveur | 13 fonctions edge (Deno) |$o$,
$n$| Logique serveur | Fonctions edge (Deno) |$n$),
$o$Resend, Sumsub, Kraken et CoinGecko, Anthropic$o$,
$n$Resend, Kraken et CoinGecko, Anthropic$n$)
where id = '60e68442-2356-444a-a929-0f8dc6e90253';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$| Sumsub | sumsub-webhook | Signature du webhook |$o$,
$n$| Base de données (nouveau dossier d'identité) | kyc-check | En-tête secret des tâches planifiées, ou jeton d'un membre administrateur, vérificateur ou conformité |$n$)
where id = '52875ef6-fb33-4062-bd1c-21de05eede2f';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(body,
$o$| Les vérifications ne démarrent pas | Interrupteur fermé, clés Sumsub, niveau introuvable | `VERIFICATION_ENABLED` ; journaux de sumsub-token |
| Un résultat Sumsub n'arrive pas | Signature du webhook refusée | Journaux de sumsub-webhook ; `SUMSUB_WEBHOOK_SECRET` |$o$,
$n$| Les vérifications ne démarrent pas | Interrupteur des vérifications fermé | Réglages → Ouverture |
| Un dossier n'a pas de rapport d'Oli | Analyse d'Oli éteinte, clé Anthropic, document illisible | Réglages → Analyse d'Oli ; « Lancer l'analyse » dans le dossier ; journaux de kyc-check |$n$)
where id = '5b62c85a-b9b9-49a9-bd69-ef85ca5b7233';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(replace(replace(body,
$o$| `sumsub-token` | Ouvre une session de vérification | App client | Jeton |
| `sumsub-webhook` | Enregistre un résultat de vérification | Sumsub | Signature |$o$,
$n$| `kyc-check` | Oli lit un dossier d'identité et écrit son rapport | Déclencheur en base, équipe | En-tête secret, jeton |
| `sumsub-token`, `sumsub-webhook` | Anciennes fonctions de Sumsub, plus utilisées | — | — |$n$),
$o$## Déploiement$o$,
$n$## kyc-check

Appelée par la base à l'arrivée d'un dossier (ou de nouveaux documents), si **Réglages → Analyse d'Oli** est allumé ; l'équipe peut aussi la lancer depuis le dossier. Elle répond tout de suite, puis lit en arrière-plan la pièce (recto, verso) et la preuve d'adresse depuis le stockage privé ; le selfie n'est pas lu. Le modèle d'Anthropic extrait les informations ; les comparaisons (nom, date de naissance, âge, expiration, chiffres de contrôle du passeport, ancienneté de la preuve d'adresse, même pièce sur un autre compte) sont faites par le code, pas par le modèle. Le rapport va dans `kyc_checks`, lisible par les administrateurs, vérificateurs et la conformité. Une erreur n'empêche jamais l'envoi du client ni l'examen du dossier.

## Déploiement$n$),
$o$Onze fonctions sont redéployées par le workflow « Déploiement fonctions edge Supabase » à chaque envoi sur `main` qui touche `supabase/functions/`. `sumsub-token` et `refresh-rate` se déploient à la main :$o$,
$n$Les fonctions sont redéployées par le workflow « Déploiement fonctions edge Supabase » à chaque envoi sur `main` qui touche `supabase/functions/`. Les anciennes fonctions de Sumsub ne servent plus. Pour déployer une fonction à la main :$n$)
where id = '10562aa3-89cc-475f-a373-00b8974a28ac';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(replace(body,
$o$| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME` | Ouverture des sessions de vérification | sumsub-token | Lancement d'une vérification de test |
| `SUMSUB_WEBHOOK_SECRET` | Signature des retours de Sumsub | sumsub-webhook | Retour d'une vérification de test |$o$,
$n$| `SUMSUB_*` | Ancien fournisseur de vérification, plus utilisé : clés à révoquer chez Sumsub | Aucune fonction active | — |$n$),
$o$| `ANTHROPIC_API_KEY` | Assistants IA | ai-assist | Un résumé de client |$o$,
$n$| `ANTHROPIC_API_KEY` | Assistants IA et analyse des dossiers par Oli | ai-assist, kyc-check | Un résumé de client ; « Relancer l'analyse » dans un dossier |$n$)
where id = '4e76e091-6f0f-4b1f-a088-2d76127344a8';
end $$;

do $$ begin
update public.kb_articles set updated_at = now(), body = replace(replace(replace(replace(body,
$o$| Sumsub | Vérification d'identité et d'entreprise | `SUMSUB_*` | Retour par webhook signé |
$o$, ''),
$o$| Anthropic | Assistants du back-office (résumés, brouillons) | `ANTHROPIC_API_KEY` | Fonction `ai-assist` |$o$,
$n$| Anthropic | Assistants du back-office, pré-analyse des dossiers d'identité par Oli | `ANTHROPIC_API_KEY` | Fonctions `ai-assist`, `kyc-check` |$n$),
$o$| Sumsub | Les nouvelles vérifications | Les clients déjà vérifiés |$o$,
$n$| Anthropic | Les assistants et le rapport d'Oli | Les vérifications, examinées par l'équipe |$n$),
$o$## Ce qui dépend de quoi$o$,
$n$La vérification d'identité est faite par l'équipe Ooble dans le back-office : aucun fournisseur externe ne la fait.

## Ce qui dépend de quoi$n$)
where id = 'bca18a20-d4db-47e4-9df3-66f9cc285524';
end $$;
