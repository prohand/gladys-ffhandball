# FFHandball

Diese Integration verfolgt französische Handballmannschaften auf **ffhandball.fr**, der
Website des französischen Handballverbands: Profiligen sowie nationale, regionale und
departementale Meisterschaften. Jede verfolgte Mannschaft wird ein Gladys-Gerät mit
Tabellenplatz, letztem Ergebnis und nächstem Spiel und speist Szenenauslöser und
Dashboard-Widgets.

Kein Konto, kein Schlüssel: Die Integration liest die öffentliche Website über das Internet
(Cloud).

Benötigt **Gladys 5.3.0 oder neuer**.

## Eine Mannschaft hinzufügen

1. Wähle auf [www.ffhandball.fr/competitions](https://www.ffhandball.fr/competitions/) die
   Saison, den Wettbewerb und klicke auf deine Mannschaft (im Spielplan oder in der Tabelle).
2. Kopiere die Adresse dieser Seite aus deinem Browser. Sie endet mit `/equipe-<Nummer>/`,
   zum Beispiel:

   ```
   https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/
   ```

3. Öffne in Gladys den Bildschirm **Konfiguration** der Integration und füge sie in
   **Mannschaften** ein. Trenne die Adressen durch Kommas, um mehrere Mannschaften zu verfolgen.
   Speichern.
4. Öffne den Reiter **Entdeckung** und lege die Geräte an.

**Du findest die Mannschaftsseite nicht?** Kopiere stattdessen die Adresse des Wettbewerbs
(oder einer seiner Gruppen) und füge sie in die Schaltfläche **Mannschaften eines Wettbewerbs
auflisten** ein: Die Antwort listet jede Mannschaft mit der einzufügenden Adresse auf.

**Neue Saison, neue Adressen.** Der Verband gibt jeder Mannschaft jede Saison eine neue
Seite: Füge im September die neue Adresse ein. Das ist ein neues Gerät (der Verlauf der
letzten Saison bleibt auf dem alten, das du löschen kannst).

## Konfiguration

| Feld                         | Wirkung                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mannschaften**             | Adressen der Mannschaftsseiten, durch Kommas (oder Leerzeichen) getrennt.                                                                       |
| **Aktualisierungsintervall** | Minuten zwischen zwei Lesevorgängen von ffhandball.fr (Standard 30, mindestens 5). Die Website aktualisiert ihre Seiten etwa einmal pro Stunde. |
| **Spielerinnerung**          | Minuten vor dem Anpfiff, zu denen „Ein Spiel beginnt gleich“ auslöst (Standard 60, 0 = beim Anpfiff).                                           |
| **Sprache der Gerätetexte**  | Sprache der Funktionsnamen und der als Zustände und Szenenvariablen veröffentlichten Texte.                                                     |

**Verbindung testen** liest jede Mannschaft erneut und zeigt pro Mannschaft, was die Website
geantwortet hat: Name, Wettbewerb, Platz und nächstes Spiel — oder warum es fehlschlug.

## Das Mannschaftsgerät

| Funktion                                          | Wert                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Platz                                             | Position in der Gruppe                                                 |
| Punkte, Spiele, Siege, Unentschieden, Niederlagen | Die Tabelle der Gruppe                                                 |
| Tordifferenz                                      | Erzielte minus kassierte Tore                                          |
| Letztes Ergebnis                                  | `1` Sieg, `0` Remis, `-1` Niederlage                                   |
| Letztes Spiel: erzielte Tore / Gegentore          | Das Ergebnis des letzten Spiels aus Sicht der Mannschaft               |
| Letztes Spiel                                     | Text, z. B. „Sieg 29-23 gegen TOULOUSE FENIX“                          |
| Nächstes Spiel                                    | Text, z. B. „Sa., 17.10., 19:00 · CAEN HANDBALL – PARIS SAINT-GERMAIN“ |
| Nächstes Spiel in (Tagen)                         | `0` am Spieltag                                                        |

Die Uhrzeiten sind französische Zeit (Europe/Paris), wie vom Verband veröffentlicht. Das
Abzeichen des Geräts zeigt **Cloud**, wenn die Mannschaft gelesen wurde, **nicht erreichbar**,
wenn ffhandball.fr nicht geantwortet hat.

## Szenen (Gladys 5.1+)

### Auslöser

| Auslöser                                             | Löst aus                                                   | Filter                         | Variablen                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Ein Spielergebnis wird veröffentlicht                | wenn das Endergebnis eines Spiels erscheint                | Mannschaft, Ergebnis, Spielort | `team`, `opponent`, `score_for`, `score_against`, `score`, `result_text`, `summary`, `competition`, `kickoff`, `kickoff_text` |
| Ein Spiel beginnt gleich                             | einmal pro Spiel, die eingestellten Minuten vor Anpfiff    | Mannschaft, Spielort           | `team`, `opponent`, `kickoff`, `kickoff_text`, `minutes_before`, `summary`, `competition`                                     |
| Der Tabellenplatz einer Mannschaft hat sich geändert | wenn die Mannschaft in ihrer Gruppe auf- oder absteigt     | Mannschaft, Richtung           | `team`, `rank`, `previous_rank`, `points`, `competition`                                                                      |
| Ein Spiel wurde verlegt                              | wenn Datum oder Uhrzeit eines kommenden Spiels sich ändert | Mannschaft, Spielort           | `team`, `opponent`, `kickoff`, `kickoff_text`, `previous_kickoff`, `previous_kickoff_text`, `summary`, `competition`          |

Verwende eine Variable in den folgenden Aktionen als `{{triggerEvent.data.<Variable>}}`, zum
Beispiel in einer Benachrichtigung: `{{triggerEvent.data.result_text}}`.

Jeder Auslöser löst **einmal pro Änderung** aus, auch nach einem Neustart: Die Integration
merkt sich, was sie schon gemeldet hat. Eine gerade hinzugefügte Mannschaft spielt ihre Saison
nicht erneut ab: Die Ereignisse beginnen mit der nächsten Änderung. Ein Ergebnis, das erst mehr
als drei Tage nach dem Spiel erscheint, oder ein korrigiertes Ergebnis löst nichts aus.

### Aktionen

| Aktion                                  | Ausgaben                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Nächstes Spiel einer Mannschaft lesen   | `found`, `team`, `opponent`, `venue` (`home`/`away`), `kickoff`, `kickoff_text`, `days_until`, `competition`, `summary`      |
| Letztes Ergebnis einer Mannschaft lesen | `found`, `team`, `opponent`, `venue`, `result` (`win`/`draw`/`loss`), `result_text`, `score_for`, `score_against`, `summary` |
| Tabellenplatz einer Mannschaft lesen    | `found`, `team`, `rank`, `points`, `played`, `won`, `drawn`, `lost`, `goal_difference`, `teams_in_pool`                      |

`found` ist `false`, wenn es nichts zu lesen gibt (kein Spiel angesetzt, noch kein Spiel
gespielt): Mache die folgenden Aktionen davon abhängig.

### Ideen

- Jeden Samstag um 9:00 _Nächstes Spiel einer Mannschaft lesen_; wenn `days_until` 0 ist,
  „Heute Spiel um {{…kickoff_text}} gegen {{…opponent}}“ senden.
- _Ein Spielergebnis wird veröffentlicht_, Ergebnis **Sieg**: das Wohnzimmerlicht in den
  Vereinsfarben einschalten.
- _Ein Spiel beginnt gleich_, Spielort **Heim**: alle daran erinnern, zur Halle aufzubrechen.

## Dashboard-Widgets (Gladys 5.1+)

| Widget            | Zeigt                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Handballteam      | Platz, Punkte und Tordifferenz (live), letztes Ergebnis, nächstes Spiel, einen Link zur Mannschaftsseite und eine Schaltfläche Aktualisieren |
| Handball-Tabelle  | Die Tabelle der Gruppe, bis zu 10 Zeilen rund um die hervorgehobene Mannschaft                                                               |
| Nächste Spiele    | Die nächsten Spiele aller verfolgten Mannschaften (1 bis 8)                                                                                  |
| Letzte Ergebnisse | Die letzten Ergebnisse aller verfolgten Mannschaften (1 bis 8)                                                                               |

## Fehlerbehebung

- **„keine Mannschaftsseite“**: Die Adresse muss `/equipe-<Nummer>/` enthalten. Nutze die
  Schaltfläche **Mannschaften eines Wettbewerbs auflisten**, um sie zu erhalten.
- **„team … not found on ffhandball.fr“**: Die Saison dieser Seite ist vorbei oder die
  Mannschaft wurde zurückgezogen. Füge die Adresse der laufenden Saison ein.
- **„ffhandball.fr unreachable“**: Die Website oder deine Internetverbindung ist ausgefallen;
  die Integration versucht es bei der nächsten Aktualisierung erneut.
- **Ein Ergebnis kommt spät**: Der Verband veröffentlicht es, sobald der Spielbericht
  abgeschlossen ist, manchmal Stunden nach dem Spiel, und seine Website speichert Seiten eine
  Stunde im Cache.

## Datenschutz

Die Integration liest nur öffentliche Seiten von ffhandball.fr. Sie sendet nichts über dich
oder dein Zuhause und speichert nur `/data/state.json` (was sie deinen Szenen schon gemeldet
hat).
