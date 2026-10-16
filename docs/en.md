# FFHandball

This integration follows French handball teams on **ffhandball.fr**, the website of the
French handball federation: professional leagues, national, regional and departmental
championships alike. Each team you follow becomes a Gladys device with its standing, its last
result and its next match, and feeds scene triggers and dashboard widgets.

No account and no key: the integration reads the public website, over the internet (cloud).

## Add a team

1. On [www.ffhandball.fr/competitions](https://www.ffhandball.fr/competitions/), pick the
   season, the competition, then click your team (in the calendar or the standings).
2. Copy the address of that page from your browser. It ends with `/equipe-<number>/`, for
   instance:

   ```
   https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/
   ```

3. In Gladys, open the integration's **Configuration** screen and paste it in **Teams**. One
   address per line to follow several teams. Save.
4. Open the **Discovery** tab and create the devices.

**Can't find the team page?** Copy the address of the competition (or of one of its pools)
instead, and paste it in the **List the teams of a competition** button: the answer lists every
team with the address to paste.

**A new season means new addresses.** The federation gives every team a new page each
season: in September, paste the new address. It is a new device (last season's history stays on
the old one, which you can delete).

## Configuration

| Field                            | What it does                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Teams**                        | Addresses of team pages, one per line.                                                                                  |
| **Refresh interval**             | Minutes between two reads of ffhandball.fr (30 by default, 5 minimum). The site refreshes its pages about once an hour. |
| **Match reminder**               | Minutes before kick-off at which "A match is about to start" fires (60 by default, 0 = at kick-off).                    |
| **Language of the device texts** | Language of the feature names and of the texts published as states and scene variables.                                 |

**Test the connection** reads every team again and says, team by team, what the site
answered: name, competition, rank and next match — or why it failed.

## The team device

| Feature                             | Value                                                               |
| ----------------------------------- | ------------------------------------------------------------------- |
| Rank                                | Position in the pool                                                |
| Points, Played, Won, Drawn, Lost    | The standings of the pool                                           |
| Goal difference                     | Goals scored minus goals conceded                                   |
| Last result                         | `1` win, `0` draw, `-1` loss                                        |
| Last match: goals scored / conceded | The score of the last match, from the team's side                   |
| Last match                          | Text, e.g. "Win 29-23 against TOULOUSE FENIX"                       |
| Next match                          | Text, e.g. "Sat 17/10, 19:00 · CAEN HANDBALL – PARIS SAINT-GERMAIN" |
| Next match in (days)                | `0` on match day                                                    |

Times are French times (Europe/Paris), as printed by the federation. The badge of the device
reads **cloud** when the team was read, **unreachable** when ffhandball.fr did not answer.

## Scenes (Gladys 5.1+)

### Triggers

| Trigger                     | Fires                                                  | Filters             | Variables                                                                                                                     |
| --------------------------- | ------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A match result is published | when the final score of a match appears                | team, result, venue | `team`, `opponent`, `score_for`, `score_against`, `score`, `result_text`, `summary`, `competition`, `kickoff`, `kickoff_text` |
| A match is about to start   | once per match, the configured minutes before kick-off | team, venue         | `team`, `opponent`, `kickoff`, `kickoff_text`, `minutes_before`, `summary`, `competition`                                     |
| A team's rank changed       | when the team moves up or down its pool                | team, direction     | `team`, `rank`, `previous_rank`, `points`, `competition`                                                                      |
| A match was rescheduled     | when the date or time of an upcoming match changes     | team, venue         | `team`, `opponent`, `kickoff`, `kickoff_text`, `previous_kickoff`, `previous_kickoff_text`, `summary`, `competition`          |

Use a variable in the following actions as `{{triggerEvent.data.<variable>}}`, for instance a
notification: `{{triggerEvent.data.result_text}}`.

Each trigger fires **once per change**, even after a restart: the integration remembers what
it already announced. A team you just added does not replay its season: events start from the
next change. A result first seen more than three days after the match, or a corrected score,
fires nothing.

### Actions

| Action                   | Outputs                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Get a team's next match  | `found`, `team`, `opponent`, `venue` (`home`/`away`), `kickoff`, `kickoff_text`, `days_until`, `competition`, `summary`      |
| Get a team's last result | `found`, `team`, `opponent`, `venue`, `result` (`win`/`draw`/`loss`), `result_text`, `score_for`, `score_against`, `summary` |
| Get a team's standing    | `found`, `team`, `rank`, `points`, `played`, `won`, `drawn`, `lost`, `goal_difference`, `teams_in_pool`                      |

`found` is `false` when there is nothing to read (no match scheduled, no match played yet):
gate the following actions on it.

### Ideas

- Every Saturday at 9:00, _Get a team's next match_; if `days_until` is 0, send
  "Match today at {{…kickoff_text}} against {{…opponent}}".
- _A match result is published_, result **Win**: turn the living room lights to the club's
  colours.
- _A match is about to start_, venue **Home**: remind everyone to leave for the gym.

## Dashboard widgets (Gladys 5.1+)

| Widget             | Shows                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Handball team      | Rank, points and goal difference (live), last result, next match, a link to the team page and a Refresh button |
| Handball standings | The table of the team's pool, up to 10 rows around the team, the team highlighted                              |
| Next matches       | The next matches of every followed team (1 to 8)                                                               |
| Last results       | The last results of every followed team (1 to 8)                                                               |

## Troubleshooting

- **"Not a team page"**: the address must contain `/equipe-<number>/`. Use the **List the
  teams of a competition** button to get it.
- **"team … not found on ffhandball.fr"**: the season of that page is over, or the team was
  withdrawn. Paste the address of the current season.
- **"ffhandball.fr unreachable"**: the site or your internet connection is down; the
  integration tries again at the next refresh.
- **A result shows up late**: the federation publishes it once the match sheet is closed,
  sometimes hours after the match, and its site caches pages for an hour.

## Privacy

The integration only reads public pages of ffhandball.fr. It sends nothing about you or your
home, and stores only `/data/state.json` (what it already announced to your scenes).
