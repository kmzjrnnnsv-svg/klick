# Multi-Agency-Collaborations — Konzept

> Status: Konzept · Nicht implementiert · Eigene Phase

## Problem

Headhunter-Agenturen arbeiten oft im Verbund: Agency A hat eine Stelle
exklusiv vom Endkunden, Agency B hat einen passenden Kandidaten in der
Datenbank. Beide wollen vermitteln, mit klarer Provisions-Aufteilung —
ohne dass der Kandidat zweimal gepitched wird oder die Endkunden-
Beziehung bricht.

Heute (P9): Eine Agentur = ein `employer`-Eintrag mit `agency_members`.
Stellen + Kandidaten + Mandate sind streng intern.

## Vision

Zwei Agenturen schließen einen **Collaboration-Vertrag** für eine
konkrete Stelle. Beide sehen die Stelle in ihrem Job-Pool, beide
können Kandidat:innen vorschlagen, beide bekommen Notifications bei
Status-Änderungen. Provisions-Verteilung ist im Vertrag fixiert.

## Architektur (geplant)

### 1. Schema

```ts
// Eine konkrete Zusammenarbeit zwischen zwei Agenturen für eine Stelle.
// Der "leadAgencyId" hält das Mandat; der "partnerAgencyId" liefert
// Kandidaten gegen Provisions-Anteil.
agency_collaborations (
	id PK,
	jobId FK → jobs,
	leadAgencyId FK → employers,        // hat das Mandat
	partnerAgencyId FK → employers,     // bringt Kandidaten ein
	status enum: pending | active | ended | rejected,
	leadCommissionPct integer,           // wieviel % bleibt beim Lead
	partnerCommissionPct integer,        // wieviel % bekommt der Partner
	scope text,                          // Notiz im Vertragstext
	startedAt timestamp,
	endedAt timestamp?,
	UNIQUE (jobId, partnerAgencyId)      // Pro Job + Partner nur ein Vertrag
)

// Welche Kandidaten hat welcher Partner für welche Collab vorgeschlagen?
// Wichtig für Conflict-of-Interest und Provisions-Tracking.
collaboration_candidate_proposals (
	id PK,
	collaborationId FK → agency_collaborations,
	candidateUserId FK → users,
	proposedByUserId FK → users,
	proposedAt timestamp,
	status enum: proposed | shortlisted | rejected | hired,
	UNIQUE (collaborationId, candidateUserId)
)
```

### 2. Permissions

Wenn eine Stelle mit einer Agency `B` shared ist:

- Mitglieder von `B` sehen die Stelle in ihrem `/jobs`-Dashboard mit
  Tag „Partner" und „read-only" auf den Stelldaten selbst
- Mitglieder von `B` können Kandidaten vorschlagen → diese landen mit
  Tag „via Partner B" in Lead-Agency `A`'s Match-Liste
- Identität von Kandidat:innen wird nur nach Approval geteilt — wie
  bisher Interest+Disclosure-Pfad
- `agency_members.role` gilt agentur-weit; Collab-Berechtigungen werden
  pro Agency gewährt, nicht pro Member

### 3. Conflict-of-Interest

Critical Edge-Cases die im Code abgefangen werden müssen:

1. **Doppelter Pitch**: Kandidat:in K wurde bereits von Lead `A`
   direkt angesprochen (Interest existiert) — Partner `B` darf ihn
   nicht erneut vorschlagen. Schema-Constraint via `interests` +
   `collaboration_candidate_proposals` (Trigger oder Server-Check).
2. **Klau**: Partner `B` darf den Endkunden von Lead `A` nicht direkt
   ansprechen, solange Collab aktiv ist. Audit-Log + Sanktionen
   manuell, kein Tech-Lock.
3. **Provisions-Drift**: leadCommissionPct + partnerCommissionPct ≠
   100 — Validation im Save.

### 4. UI

**Lead-Agency:**
- Auf jeder Stelle: neuer Subnav-Button „Partner-Agencies"
- Liste der aktiven Collabs + Button „Neue Partner-Agency einladen"
- Per E-Mail-Adresse einer anderen registrierten Agency (lookup via
  `employers.userId.email` oder `agency_members.inviteEmail`)

**Partner-Agency:**
- Im `/jobs`-Dashboard zusätzliche Sektion „Partner-Stellen"
- Klick → read-only Stell-Detail + Button „Kandidat vorschlagen"
- Vorschlag aus eigener Talent-DB (filterable Liste)

**Kandidat:**
- Sieht NIE, dass die Stelle Multi-Agency ist — bleibt UX-konsistent
- Im Verhandlungsverlauf: bei Approval Tag „vermittelt von [Partner-
  Agency]" optional (Visibility-Flag)

### 5. Provisions-Tracking

Wenn ein Outcome `hired` für einen vom Partner vorgeschlagenen
Kandidaten reportet wird:

1. System erstellt automatisch einen `commission_event`-Eintrag mit
   `leadAmount` und `partnerAmount` basierend auf den Pcts
2. Lead bekommt Notification „X € Provision für die-und-die Stelle"
3. Partner bekommt Notification „Y € Provisions-Anteil"
4. Kein Geld-Transfer in der App — nur Tracking. Auszahlung läuft
   weiter über Buchhaltung der Agenturen.

```ts
commission_events (
	id PK,
	collaborationId FK,
	candidateUserId FK,
	totalCommissionEur integer,
	leadAmountEur integer,
	partnerAmountEur integer,
	createdAt timestamp,
	settledAt timestamp?           // wenn Buchhaltung "bezahlt" markiert
)
```

### 6. Server-Actions (geplant)

```
inviteCollaboration({ jobId, partnerEmail, leadPct, partnerPct, scope })
acceptCollaboration({ collaborationId })
rejectCollaboration({ collaborationId })
endCollaboration({ collaborationId })
proposeCandidate({ collaborationId, candidateUserId, note })
listCollaborationsForJob(jobId)         // both sides
listIncomingCollaborations()            // partner side
listMyProposalsForCollab(collabId)      // either side
recordCommissionFromOutcome(outcomeId)  // internal, called by reportOutcome
```

### 7. Migration & Roll-out

Phase 1 (data layer):
- Migration für 3 neue Tabellen
- Server-actions ohne UI

Phase 2 (UI):
- Lead-Agency: Collab-Verwaltung pro Stelle
- Partner-Agency: Inbox + Vorschlag-Form

Phase 3 (Polish):
- Provisions-Dashboard (`/agency/commissions`)
- Audit-Trail für Conflict-of-Interest-Checks
- Mail-Templates für Collab-Einladungen

## Was vorher passieren muss

- [ ] Datenschutz-Bewertung: Multi-Agency = Personenbezogene Daten
      werden zwischen Verarbeitern geteilt → ggf. Auftragsverarbeitungs-
      Vertrag (AVV) zwischen Agencies notwendig (Klick = Vermittler)
- [ ] Klärung: Zustimmung des Kandidaten? Heute ist Disclosure pro
      Interest. Bei Multi-Agency müsste der Kandidat ggf. wissen
      "vermittelt von Partner B" — UX-Frage
- [ ] Stripe / Buchhaltungs-Integration als optional (P10+) für echte
      Auszahlung

## Schätzung

- Phase 1 (Schema + Actions): 1 Session
- Phase 2 (UI): 1 Session
- Phase 3 (Polish + Tests): 1 Session
- Datenschutz-Review: extern, 1-2 Wochen Lead-Time

Total: 3 Sessions Code + Datenschutz-Klärung bevor produktiv.

## Verbindung zu existierenden Phasen

- **agency_members** (P9): Bleibt unverändert — Berechtigung pro
  Mitglied innerhalb einer Agentur
- **job_mandates** (P9): Bleibt — wenn Agency das Mandat hat,
  beschreibt sie hier den Endkunden. Multi-Agency baut darauf auf.
- **outcomes** (P5): triggert `recordCommissionFromOutcome` bei
  hired-status
- **interests / disclosures** (P5/P6): Conflict-of-Interest-Check
  basiert auf existierenden `interests`-Rows
