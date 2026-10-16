# FFHandball

Cette intégration suit des équipes de handball sur **ffhandball.fr**, le site de la Fédération
Française de Handball : ligues professionnelles, championnats nationaux, régionaux et
départementaux. Chaque équipe suivie devient un appareil Gladys avec son classement, son
dernier résultat et son prochain match, et alimente des déclencheurs de scène et des widgets.

Pas de compte, pas de clé : l'intégration lit le site public, par internet (cloud).

## Ajouter une équipe

1. Sur [www.ffhandball.fr/competitions](https://www.ffhandball.fr/competitions/), choisissez la
   saison, la compétition, puis cliquez sur votre équipe (dans le calendrier ou le classement).
2. Copiez l'adresse de cette page dans votre navigateur. Elle finit par `/equipe-<numéro>/`,
   par exemple :

   ```
   https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/
   ```

3. Dans Gladys, ouvrez l'écran **Configuration** de l'intégration et collez-la dans
   **Équipes**. Une adresse par ligne pour suivre plusieurs équipes. Enregistrez.
4. Ouvrez l'onglet **Découverte** et créez les appareils.

**Vous ne trouvez pas la page de l'équipe ?** Copiez plutôt l'adresse de la compétition (ou
d'une de ses poules) et collez-la dans le bouton **Lister les équipes d'une compétition** : la
réponse liste chaque équipe avec l'adresse à coller.

**Nouvelle saison, nouvelles adresses.** La fédération donne une nouvelle page à chaque équipe
à chaque saison : en septembre, collez la nouvelle adresse. C'est un nouvel appareil
(l'historique de la saison passée reste sur l'ancien, que vous pouvez supprimer).

## Configuration

| Champ                               | Rôle                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Équipes**                         | Adresses des pages équipe, une par ligne.                                                                                         |
| **Intervalle de rafraîchissement**  | Minutes entre deux lectures de ffhandball.fr (30 par défaut, 5 minimum). Le site rafraîchit ses pages environ une fois par heure. |
| **Rappel de match**                 | Minutes avant le coup d'envoi où « Un match va commencer » se déclenche (60 par défaut, 0 = au coup d'envoi).                     |
| **Langue des textes des appareils** | Langue des noms des fonctionnalités et des textes publiés comme états et variables de scène.                                      |

**Tester la connexion** relit chaque équipe et indique, équipe par équipe, ce que le site a
répondu : nom, compétition, rang et prochain match — ou la raison de l'échec.

## L'appareil équipe

| Fonctionnalité                           | Valeur                                                                |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Classement                               | Place dans la poule                                                   |
| Points, Joués, Gagnés, Nuls, Perdus      | Le classement de la poule                                             |
| Différence de buts                       | Buts marqués moins buts encaissés                                     |
| Dernier résultat                         | `1` victoire, `0` nul, `-1` défaite                                   |
| Dernier match : buts marqués / encaissés | Le score du dernier match, du côté de l'équipe                        |
| Dernier match                            | Texte, ex. « Victoire 29-23 contre TOULOUSE FENIX »                   |
| Prochain match                           | Texte, ex. « sam. 17/10 19:00 · CAEN HANDBALL – PARIS SAINT-GERMAIN » |
| Prochain match dans (jours)              | `0` le jour du match                                                  |

Les heures sont à l'heure française (Europe/Paris), comme les publie la fédération. Le badge de
l'appareil indique **cloud** quand l'équipe a été lue, **injoignable** quand ffhandball.fr n'a
pas répondu.

## Scènes (Gladys 5.1+)

### Déclencheurs

| Déclencheur                         | Se déclenche                                             | Filtres                | Variables                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Un résultat de match est publié     | quand le score final d'un match apparaît                 | équipe, résultat, lieu | `team`, `opponent`, `score_for`, `score_against`, `score`, `result_text`, `summary`, `competition`, `kickoff`, `kickoff_text` |
| Un match va commencer               | une fois par match, le nombre de minutes configuré avant | équipe, lieu           | `team`, `opponent`, `kickoff`, `kickoff_text`, `minutes_before`, `summary`, `competition`                                     |
| Le classement d'une équipe a changé | quand l'équipe gagne ou perd des places dans sa poule    | équipe, sens           | `team`, `rank`, `previous_rank`, `points`, `competition`                                                                      |
| Un match a été reprogrammé          | quand la date ou l'heure d'un prochain match change      | équipe, lieu           | `team`, `opponent`, `kickoff`, `kickoff_text`, `previous_kickoff`, `previous_kickoff_text`, `summary`, `competition`          |

Utilisez une variable dans les actions suivantes sous la forme
`{{triggerEvent.data.<variable>}}`, par exemple dans une notification :
`{{triggerEvent.data.result_text}}`.

Chaque déclencheur se déclenche **une fois par changement**, même après un redémarrage :
l'intégration se souvient de ce qu'elle a déjà annoncé. Une équipe tout juste ajoutée ne
rejoue pas sa saison : les événements partent du prochain changement. Un résultat vu pour la
première fois plus de trois jours après le match, ou un score corrigé, ne déclenche rien.

### Actions

| Action                                | Sorties                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Lire le prochain match d'une équipe   | `found`, `team`, `opponent`, `venue` (`home`/`away`), `kickoff`, `kickoff_text`, `days_until`, `competition`, `summary`      |
| Lire le dernier résultat d'une équipe | `found`, `team`, `opponent`, `venue`, `result` (`win`/`draw`/`loss`), `result_text`, `score_for`, `score_against`, `summary` |
| Lire le classement d'une équipe       | `found`, `team`, `rank`, `points`, `played`, `won`, `drawn`, `lost`, `goal_difference`, `teams_in_pool`                      |

`found` vaut `false` quand il n'y a rien à lire (aucun match programmé, aucun match joué) :
conditionnez les actions suivantes dessus.

### Idées

- Chaque samedi à 9:00, _Lire le prochain match d'une équipe_ ; si `days_until` vaut 0, envoyer
  « Match aujourd'hui à {{…kickoff_text}} contre {{…opponent}} ».
- _Un résultat de match est publié_, résultat **Victoire** : mettre les lumières du salon aux
  couleurs du club.
- _Un match va commencer_, lieu **Domicile** : rappeler à tout le monde de partir au gymnase.

## Widgets du tableau de bord (Gladys 5.1+)

| Widget              | Affiche                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Équipe de handball  | Rang, points et différence de buts (en direct), dernier résultat, prochain match, un lien vers la page de l'équipe et un bouton Actualiser |
| Classement handball | Le classement de la poule de l'équipe, jusqu'à 10 lignes autour de l'équipe, mise en avant                                                 |
| Prochains matchs    | Les prochains matchs de toutes les équipes suivies (1 à 8)                                                                                 |
| Derniers résultats  | Les derniers résultats de toutes les équipes suivies (1 à 8)                                                                               |

## En cas de problème

- **« pas une page équipe »** : l'adresse doit contenir `/equipe-<numéro>/`. Utilisez le
  bouton **Lister les équipes d'une compétition** pour l'obtenir.
- **« team … not found on ffhandball.fr »** : la saison de cette page est terminée, ou l'équipe
  a été retirée. Collez l'adresse de la saison en cours.
- **« ffhandball.fr unreachable »** : le site ou votre connexion internet est en panne ;
  l'intégration réessaie au prochain rafraîchissement.
- **Un résultat arrive tard** : la fédération le publie une fois la feuille de match clôturée,
  parfois des heures après le match, et son site garde ses pages en cache une heure.

## Vie privée

L'intégration ne lit que des pages publiques de ffhandball.fr. Elle n'envoie rien sur vous ni
sur votre maison, et ne stocke que `/data/state.json` (ce qu'elle a déjà annoncé à vos scènes).
