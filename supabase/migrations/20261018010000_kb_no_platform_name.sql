-- Base de connaissances › Règlement automatique : aucune plateforme nommée.
update public.kb_articles set body = replace(body,
'depuis une plateforme d''échange (Binance…) envoie',
'depuis une plateforme d''échange envoie')
 where title = 'Règlement automatique';
