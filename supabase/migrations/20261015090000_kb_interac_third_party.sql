-- Base de connaissances › Règlement automatique : la règle du nom de l'expéditeur Interac, plus stricte.
update public.kb_articles set body = replace(body,
'| Expéditeur | Le nom du client (particulier) ou la raison sociale (entreprise) |

Quand l''avis est rapproché, l''ordre passe à « paiement reçu » et l''envoi des USDT est lancé.',
'| Expéditeur | Le nom du client (particulier) ou la raison sociale (entreprise), jamais un compte conjoint |

Quand l''avis est rapproché, l''ordre passe à « paiement reçu » et l''envoi des USDT est lancé.

**Paiement d''un tiers.** Interac écrit dans l''avis le nom du titulaire du compte bancaire qui a payé. Ooble le compare au nom vérifié du client (pièce d''identité) ou à la raison sociale : majuscules, accents, ordre des mots et civilités ne comptent pas, un deuxième prénom présent d''un seul côté est accepté. Tout le reste bloque : un autre prénom (« Marie Tremblay » pour « Jean Tremblay »), un nom incomplet, ou un compte conjoint (« Jean Tremblay et Marie Roy »), car l''argent peut venir de l''autre titulaire. L''avis passe alors « À vérifier », la commande ne bouge pas, **aucun USDT ne part automatiquement**, et une alerte « paiement d''un tiers ? » s''ouvre en Conformité. L''équipe vérifie avec le client avant de marquer le paiement reçu, ou rembourse.')
 where title = 'Règlement automatique';
