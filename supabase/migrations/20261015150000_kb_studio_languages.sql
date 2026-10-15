-- Base de connaissances › Studio des courriels : courriels en français et en anglais.
update public.kb_articles set updated_at = now(), body = replace(body, $a$## Ce qui ne change pas$a$, $b$## Français et anglais

Chaque courriel existe en français et en anglais. **Langue des textes** choisit la version à modifier ; le style vaut pour les deux. Chaque client reçoit sa langue : celle de la page où il s'est inscrit (site anglais = anglais), puis celle de son app, qu'il peut changer dans **Mon compte → Langue (app et courriels)**. Sans langue connue, le courriel part en français. La fiche client indique sa langue. L'adresse IP ne sert jamais à choisir la langue.

Les montants, la date et les libellés sont mis en anglais automatiquement. La raison d'un refus de vérification part telle que l'équipe l'a écrite : écrivez-la en anglais pour un client anglophone.

## Ce qui ne change pas$b$)
where slug = 'studio-courriels' and position('## Français et anglais' in body) = 0;
