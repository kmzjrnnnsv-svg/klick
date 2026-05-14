import Anthropic from "@anthropic-ai/sdk";
import { applyExtractionPostprocessing } from "./normalize";
import type {
	AIProvider,
	CandidateNarrative,
	CandidateNarrativeInput,
	CareerAnalysis,
	ExtractedDocument,
	ExtractedJobPosting,
	ExtractedProfile,
	JobPostingQuality,
	MatchAssessment,
	MatchAssessmentInput,
	MatchRationaleInput,
	ProfileTranslationInput,
	ProfileTranslationOutput,
	SalaryBenchmark,
	SalaryBenchmarkInput,
	SuggestedJobRequirement,
} from "./types";

// 1:1-Durchreichen bei from === to bzw. Fallback wenn die KI nicht antwortet.
function passthroughTranslation(
	input: ProfileTranslationInput,
): ProfileTranslationOutput {
	return {
		headline: input.headline ?? undefined,
		summary: input.summary ?? undefined,
		industries: input.industries ?? undefined,
		languages: input.languages ?? undefined,
		skills: input.skills ?? undefined,
		experience: input.experience
			? input.experience.map((e) => ({
					role: e.role,
					description: e.description ?? undefined,
				}))
			: undefined,
		education: input.education
			? input.education.map((e) => ({
					degree: e.degree,
					thesisTitle: e.thesisTitle ?? undefined,
					focus: e.focus ?? undefined,
				}))
			: undefined,
		awards: input.awards ?? undefined,
		mobility: input.mobility ?? undefined,
		projects: input.projects
			? input.projects.map((p) => ({
					name: p.name,
					role: p.role ?? undefined,
					description: p.description ?? undefined,
				}))
			: undefined,
		publications: input.publications
			? input.publications.map((p) => ({
					title: p.title,
					venue: p.venue ?? undefined,
				}))
			: undefined,
		volunteering: input.volunteering
			? input.volunteering.map((v) => ({
					organization: v.organization,
					role: v.role,
					description: v.description ?? undefined,
				}))
			: undefined,
	};
}

// Falls Claude wegen maxLength oder max_tokens mitten im Wort abschneidet
// (z. B. "...Compliance mit D"), drop bis zum letzten echten Satz-Ende.
// Wenn nichts Sinnvolles übrig bleibt → leerer String, der Caller blendet
// das Feld dann aus statt einen Fragment anzuzeigen.
function finishSentence(s: string): string {
	const trimmed = s.trim();
	if (!trimmed) return "";
	if (/[.!?…»"')\]]$/.test(trimmed)) return trimmed;
	const lastTerminator = Math.max(
		trimmed.lastIndexOf("."),
		trimmed.lastIndexOf("!"),
		trimmed.lastIndexOf("?"),
		trimmed.lastIndexOf("…"),
	);
	if (lastTerminator >= 20) return trimmed.slice(0, lastTerminator + 1);
	// Komplett kaputt — kein Punkt drin oder zu wenig Substanz. Lieber
	// nichts zeigen als hängende Halbzeile.
	return "";
}

const PROFILE_TOOL_SCHEMA = {
	type: "object" as const,
	properties: {
		displayName: { type: "string", description: "Full name as on the CV" },
		headline: {
			type: "string",
			description: "Current or most recent job title",
		},
		location: { type: "string", description: "City, country" },
		yearsExperience: {
			type: "integer",
			minimum: 0,
			description: "Total years of professional work experience",
		},
		languages: {
			type: "array",
			items: {
				type: "string",
				pattern: "^[a-z]{2}:(native|c2|c1|b2|b1|a2|a1)$",
			},
			description: "Format like 'de:native' or 'en:c1'",
		},
		skills: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					level: { type: "integer", minimum: 1, maximum: 5 },
				},
				required: ["name"],
			},
		},
		experience: {
			type: "array",
			items: {
				type: "object",
				properties: {
					company: { type: "string" },
					role: { type: "string" },
					start: { type: "string", description: "YYYY-MM" },
					end: { type: "string", description: "YYYY-MM or 'present'" },
					description: { type: "string" },
					employmentType: {
						type: "string",
						enum: [
							"employee",
							"self_employed",
							"freelance",
							"founder",
							"internship",
							"other",
						],
						description:
							"Working relationship for this row. Use 'founder' ONLY for entrepreneurial roles where the candidate built or co-founded the company (Gründer:in, Co-Founder, CEO own startup). 'self_employed' for sole proprietor / Inhaber:in / Geschäftsführer:in own established business that wasn't a fresh founding. 'freelance' for freelance / contractor work without permanent role. 'employee' for permanent employment. 'internship' for Praktikum / Werkstudent. 'other' otherwise. Skip if unclear.",
					},
				},
				required: ["company", "role", "start"],
			},
		},
		education: {
			type: "array",
			items: {
				type: "object",
				properties: {
					institution: { type: "string" },
					degree: {
						type: "string",
						description:
							"Studien-/Ausbildungs-Bezeichnung OHNE Status-Zusätze. NICHT '(ohne Abschluss)' in den Titel schreiben — dafür `completed=false` setzen.",
					},
					start: { type: "string" },
					end: { type: "string" },
					completed: {
						type: "boolean",
						description:
							"true wenn der/die Bewerber:in den Abschluss erlangt hat. false wenn der CV 'abgebrochen', 'ohne Abschluss', 'kein Abschluss', 'nicht abgeschlossen', 'discontinued' o.Ä. nennt. Im Zweifel true. Niemals raten.",
					},
					degreeType: {
						type: "string",
						enum: [
							"school",
							"apprenticeship",
							"bachelor",
							"master",
							"phd",
							"mba",
							"other",
						],
						description:
							"Klassifiziere den Abschluss-Typ: school = Abitur/Realschule, apprenticeship = duale Ausbildung/Lehre, bachelor / master / phd / mba selbsterklärend, other für alles andere (Diplom, Magister, Berufsfachschule).",
					},
					grade: {
						type: "string",
						maxLength: 60,
						description:
							"Abschlussnote / Endnote falls im CV genannt. Beispiele: '1,7', '2:1 (Honours)', 'summa cum laude', 'distinction', 'GPA 3.8'. Originalformat behalten. Nichts raten.",
					},
					thesisTitle: {
						type: "string",
						maxLength: 300,
						description:
							"Titel der Abschluss-/Bachelor-/Master-/Doktorarbeit, falls im CV genannt. Vollständig übernehmen.",
					},
					focus: {
						type: "string",
						maxLength: 200,
						description:
							"Schwerpunkt / Vertiefungsrichtung / Modul-Schwerpunkt, falls im CV genannt. Z.B. 'Maschinelles Lernen, Verteilte Systeme'.",
					},
				},
				required: ["institution", "degree"],
			},
		},
		publications: {
			type: "array",
			items: {
				type: "object",
				properties: {
					title: { type: "string" },
					year: { type: "string" },
					kind: {
						type: "string",
						enum: ["article", "talk", "patent", "book", "other"],
					},
					venue: { type: "string" },
					url: { type: "string" },
				},
				required: ["title"],
			},
			description:
				"Veröffentlichungen, Vorträge, Patente, Bücher. Eines pro Eintrag mit Titel + Jahr (falls bekannt). Nur was im CV explizit genannt wird.",
		},
		projects: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					role: { type: "string" },
					url: { type: "string" },
					description: { type: "string", maxLength: 500 },
				},
				required: ["name"],
			},
			description:
				"Open-Source-Projekte, Side Projects, GitHub-Projekte mit eigener Beteiligung. Nicht jede Erfahrung — nur Projekte, die separat aufgeführt sind.",
		},
		volunteering: {
			type: "array",
			items: {
				type: "object",
				properties: {
					organization: { type: "string" },
					role: { type: "string" },
					start: { type: "string", description: "YYYY-MM" },
					end: { type: "string", description: "YYYY-MM or 'present'" },
					description: { type: "string", maxLength: 500 },
				},
				required: ["organization", "role"],
			},
			description:
				"Ehrenamtliche Tätigkeiten / Engagement (Vereine, NGOs, Hochschulgremien, Mentor:innen-Programme).",
		},
		drivingLicenses: {
			type: "array",
			items: { type: "string", maxLength: 8 },
			description:
				"Führerschein-Klassen wie 'B', 'BE', 'C1', 'A2'. Falls im CV unter 'Führerschein' / 'Driving License' genannt.",
		},
		availability: {
			type: "object",
			properties: {
				status: {
					type: "string",
					enum: ["immediate", "notice", "date", "unknown"],
					description:
						"immediate = sofort verfügbar; notice = Kündigungsfrist (noticeWeeks setzen); date = ab konkretem Datum (availableFrom setzen); unknown = nicht aus dem CV ableitbar.",
				},
				noticeWeeks: { type: "integer", minimum: 0, maximum: 52 },
				availableFrom: { type: "string", description: "YYYY-MM-DD" },
			},
			description:
				"Verfügbarkeit / Kündigungsfrist. Nur ausfüllen wenn der CV es klar nennt.",
		},
		socialLinks: {
			type: "object",
			properties: {
				github: { type: "string" },
				linkedin: { type: "string" },
				xing: { type: "string" },
				website: { type: "string" },
			},
			description:
				"Profil-/Portfolio-URLs aus dem CV-Header. Vollständige URLs mit Schema (https://).",
		},
		workPermitStatus: {
			type: "string",
			enum: ["eu", "permit", "requires_sponsorship", "unknown"],
			description:
				"eu = EU-/EWR-Bürger:in; permit = bestehende Aufenthalts-/Arbeitserlaubnis für DACH; requires_sponsorship = braucht Sponsoring; unknown = nicht erkennbar. Nur setzen wenn der CV das explizit nennt.",
		},
		summary: {
			type: "string",
			maxLength: 500,
			description:
				"Kurzprofil in 2-4 Sätzen, geschrieben in der Sprache des CVs. IMMER ausfüllen: wenn der CV keinen Profiltext enthält, formuliere selbst aus Titel + Top-Skills + Erfahrung einen sachlichen Mini-Pitch. Niemals leer lassen.",
		},
		industries: {
			type: "array",
			items: { type: "string", maxLength: 60 },
			description:
				"Industries / domains the candidate worked in. 1-5 short labels in the CV's language (e.g. ['Fintech', 'Healthcare', 'E-Commerce']).",
		},
		awards: {
			type: "array",
			items: { type: "string", maxLength: 200 },
			description:
				"Awards, prizes, publications, talks, hackathon wins. One line each. Only if explicit in the CV.",
		},
		certificationsMentioned: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description:
							"OFFIZIELLE Bezeichnung wie der Anbieter sie nennt. Beispiele: 'ISO/IEC 27001:2022 Lead Implementer' (PECB), 'Microsoft Certified: Azure Administrator Associate' statt 'Microsoft Azure Administrator (AZ-104)', 'ITIL® 4 Foundation' statt 'ITIL V4'. Wenn die offizielle Bezeichnung NICHT eindeutig erkennbar ist, übernimm den Wortlaut aus dem CV unverändert — nicht raten.",
					},
					issuer: {
						type: "string",
						description:
							"Offizieller Aussteller/Anbieter falls erkennbar (ISACA, PECB, Microsoft, AXELOS, ISC2, BSI, …). Leer lassen wenn nicht klar zuordenbar.",
					},
					year: { type: "string", description: "YYYY" },
					status: {
						type: "string",
						enum: ["obtained", "in_preparation", "course_completed", "unknown"],
						description:
							"obtained = Prüfung bestanden / Zertifikat ausgestellt; in_preparation = Bewerber bereitet sich vor; course_completed = Lehrgang absolviert aber Prüfung nicht (oder noch nicht) abgelegt; unknown = nicht ableitbar.",
					},
					verbatim: {
						type: "string",
						description:
							"Wortlaut wie er im CV steht — wird NUR gespeichert wenn der offizielle Name vom CV-Wortlaut abweicht. Hilft bei Zweifeln nachzuvollziehen woher die Normalisierung kam.",
					},
				},
				required: ["name"],
			},
			description:
				"Certifications cited in the CV body (the candidate may or may not have uploaded the file). Normalisiere auf den offiziellen Anbieter-Wortlaut, falls erkennbar; sonst CV-Original behalten.",
		},
		mobility: {
			type: "string",
			maxLength: 80,
			description:
				"Working-style preference if explicitly stated: 'remote', 'hybrid Berlin', 'open to relocation'. Don't infer.",
		},
		preferredRoleLevel: {
			type: "string",
			enum: ["junior", "mid", "senior", "lead", "principal", "exec"],
			description:
				"Inferred career level based on titles + years. Skip if unclear.",
		},
	},
};

const SUPPORTED_IMAGE_MIME = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
]);

export class ClaudeAIProvider implements AIProvider {
	readonly slug = "claude";
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
	}

	async parseCv(bytes: Uint8Array, mime: string): Promise<ExtractedProfile> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			throw new Error(`Unsupported MIME type for CV parse: ${mime}`);
		}

		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 4096,
			tools: [
				{
					name: "save_profile",
					description: "Save the structured profile extracted from the CV.",
					input_schema: PROFILE_TOOL_SCHEMA,
				},
			],
			tool_choice: { type: "tool", name: "save_profile" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{
							type: "text" as const,
							text:
								"Extract the structured profile from this CV.\n\n" +
								"Be thorough: comb through the document for every relevant field, including:\n" +
								"- skills (with self-rated levels if mentioned)\n" +
								"- every employment row with start/end dates\n" +
								"- every education entry\n" +
								"- industries / domains worked in (e.g. Fintech, Healthcare)\n" +
								"- awards, prizes, talks, publications, certifications cited in the body\n" +
								"- mobility preferences if explicitly stated (remote / hybrid X / relocation)\n" +
								"- inferred role level (junior … exec) based on titles + years\n\n" +
								"Zertifikats-Regel:\n" +
								"  Verwende für `certificationsMentioned.name` die OFFIZIELLE Bezeichnung wie der Anbieter sie nennt, falls erkennbar. Beispiele:\n" +
								"  - 'ISO 27001 Lead Implementer' → 'ISO/IEC 27001 Lead Implementer' + issuer 'PECB' (oder TÜV Rheinland je nach Kontext)\n" +
								"  - 'Microsoft Azure Administrator (AZ-104)' → 'Microsoft Certified: Azure Administrator Associate' + issuer 'Microsoft'\n" +
								"  - 'ITIL V4' → 'ITIL® 4 Foundation' (oder höhere Stufe wenn im CV) + issuer 'AXELOS / PeopleCert'\n" +
								"  - 'CISM' → 'Certified Information Security Manager (CISM)' + issuer 'ISACA'\n" +
								"  Wenn die offizielle Bezeichnung NICHT eindeutig zuordenbar ist (generische oder firmen-interne Lehrgänge), übernimm den Wortlaut aus dem CV UNVERÄNDERT und setze status='unknown'. Niemals raten.\n" +
								"  Setze `status`: obtained / in_preparation / course_completed / unknown — basiert auf Worten wie 'absolviert', 'bestanden', 'in Vorbereitung', 'Lehrgang' im CV.\n" +
								"  Setze `verbatim` mit dem Original-Wortlaut nur wenn `name` davon abweicht.\n\n" +
								"Bei `education` schreibe NIEMALS Status-Zusätze wie '(ohne Abschluss)' in den `degree`-Titel. Wenn das Studium abgebrochen wurde, setze `completed=false`. Sonst `completed=true` (oder weglassen). Klassifiziere `degreeType` (school/apprenticeship/bachelor/master/phd/mba/other), übernimm `grade` (Endnote, Originalformat) und `thesisTitle` (Bachelor-/Master-/Doktorarbeits-Titel) wenn im CV genannt. `focus` für Vertiefungsrichtung/Schwerpunkt.\n\n" +
								"Wenn der CV folgende Sektionen enthält, fülle die zugehörigen Arrays/Objekte: `publications` (Veröffentlichungen + Vorträge + Patente), `projects` (Open-Source / Side Projects), `volunteering` (Ehrenamt), `drivingLicenses` (Führerschein-Klassen), `availability` (Verfügbarkeit / Kündigungsfrist), `socialLinks` (GitHub/LinkedIn/Xing/Portfolio aus dem Header), `workPermitStatus` (nur wenn explizit genannt). Niemals raten — wenn nicht im CV, weglassen.\n\n" +
								"Be conservative on identity / private fields: omit rather than guess.\n" +
								"`summary` IMMER befüllen — 2-4 Sätze, Sprache des CVs. Falls der CV keinen Profil-Text enthält, formuliere selbst aus Headline + Top-Skills + jüngster Erfahrung einen sachlichen Mini-Pitch.\n" +
								"Call save_profile.",
						},
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block");
		}
		return applyExtractionPostprocessing(toolUse.input as ExtractedProfile);
	}

	async extractDocument(
		bytes: Uint8Array,
		mime: string,
		hint: "cv" | "certificate" | "badge" | "id_doc" | "other",
	): Promise<ExtractedDocument> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			// Non-visual files (json, plain text, etc.) — let the heuristic stand;
			// we'd need a different prompt path to handle these.
			return { kind: hint, data: {} } as ExtractedDocument;
		}

		// CV path is fully implemented elsewhere — reuse it for the rich shape.
		if (hint === "cv") {
			const data = await this.parseCv(bytes, mime);
			return { kind: "cv", data };
		}

		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const schemaByHint: Record<string, Record<string, unknown>> = {
			certificate: {
				type: "object",
				properties: {
					title: { type: "string" },
					issuer: { type: "string" },
					subject: { type: "string" },
					grade: { type: "string" },
					issuedAt: { type: "string", description: "YYYY-MM(-DD)" },
					expiresAt: { type: "string" },
					credentialId: { type: "string" },
				},
			},
			id_doc: {
				type: "object",
				properties: {
					docType: {
						type: "string",
						enum: ["passport", "id_card", "drivers_license", "other"],
					},
					fullName: { type: "string" },
					expiresAt: { type: "string" },
				},
			},
			badge: {
				type: "object",
				properties: {
					name: { type: "string" },
					issuerName: { type: "string" },
					issuedAt: { type: "string" },
					criteriaUrl: { type: "string" },
					imageUrl: { type: "string" },
				},
			},
			other: {
				type: "object",
				properties: {
					title: { type: "string" },
					summary: { type: "string", maxLength: 300 },
				},
			},
		};

		const promptByHint: Record<string, string> = {
			certificate:
				"Extrahiere die Eckdaten dieses Zertifikats / Zeugnisses. Nur was klar im Dokument steht. Keine Vermutungen.",
			id_doc:
				"Erkenne nur den Dokumenttyp (Pass / Ausweis / Führerschein) und ggf. das Ablaufdatum. KEINE biometrischen oder MRZ-Daten ausgeben.",
			badge:
				"Extrahiere Name, Aussteller und Ausstellungsdatum dieses Open Badges. Falls Bild- oder Kriterien-URL erkennbar, mit angeben.",
			other:
				"Erkenne grob, was das für ein Dokument ist. Liefere Titel + 1-2 Sätze Zusammenfassung.",
		};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 1024,
			tools: [
				{
					name: "save_metadata",
					description:
						"Save the structured metadata extracted from the document.",
					input_schema: schemaByHint[hint] as never,
				},
			],
			tool_choice: { type: "tool", name: "save_metadata" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{ type: "text" as const, text: promptByHint[hint] },
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		const data =
			toolUse && toolUse.type === "tool_use"
				? (toolUse.input as Record<string, unknown>)
				: {};
		return { kind: hint, data } as ExtractedDocument;
	}

	async suggestJobRequirements(input: {
		title: string;
		description: string;
		locale?: "de" | "en";
	}): Promise<SuggestedJobRequirement[]> {
		const targetLang = input.locale === "en" ? "Englisch" : "Deutsch";
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 1024,
			tools: [
				{
					name: "save_requirements",
					description:
						"Save the suggested job requirements as a structured list.",
					input_schema: {
						type: "object" as const,
						properties: {
							requirements: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										weight: { type: "string", enum: ["must", "nice"] },
										minLevel: {
											type: "integer",
											minimum: 1,
											maximum: 5,
										},
									},
									required: ["name", "weight"],
								},
							},
						},
						required: ["requirements"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_requirements" },
			system:
				"Du extrahierst konkrete, prüfbare Skill-Anforderungen aus Stellenbeschreibungen.\n\n" +
				`AUSGABE-SPRACHE: ${targetLang}. ALLE \`name\`-Felder müssen in ${targetLang} sein, unabhängig von der Sprache der Stellenbeschreibung.\n\n` +
				"REGELN FÜR `name`:\n" +
				`• Verwende REALE, in ${targetLang} im Duden bzw. Branchen-Sprachgebrauch belegte Begriffe. Erfinde KEINE Wörter und KEINE Kunst-Komposita.\n` +
				"• Etablierte Fachbegriffe (TypeScript, Stakeholder Management, Product Owner, SaaS, B2B, ISO 27001) bleiben in ihrer Standard-Form — diese sind sprach-neutral.\n" +
				"• Software/Stack: offizielle Schreibweise (z.B. 'TypeScript' nicht 'Typescript', 'Next.js' nicht 'NextJs').\n" +
				"• Soft Skills nur dann, wenn die Stellenbeschreibung sie EXPLIZIT verlangt. Niemals raten.\n" +
				"• Jeder Skill prägnant: ein bis drei Worte. Lange Erklärungssätze gehören NICHT in `name`.\n" +
				"• Im Zweifel: lieber weniger Skills + dafür präzise.",
			messages: [
				{
					role: "user",
					content:
						`Title: ${input.title}\n\n${input.description}\n\n` +
						`Extrahiere bis zu 8 Skills (ALLE Namen auf ${targetLang}). Markiere maximal 4 als "must" (wirklich essenziell), den Rest als "nice". Setze minLevel (1-5) für Must-Haves wo Seniorität impliziert ist.`,
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block");
		}
		const out = toolUse.input as { requirements: SuggestedJobRequirement[] };
		return out.requirements ?? [];
	}

	async summarizeCandidate(
		input: CandidateNarrativeInput,
	): Promise<CandidateNarrative> {
		const langName = input.locale === "en" ? "Englisch" : "Deutsch";
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 2000,
			tools: [
				{
					name: "save_narrative",
					description:
						"Save the holistic candidate narrative read by the employer.",
					input_schema: {
						type: "object" as const,
						properties: {
							summary: {
								type: "string",
								maxLength: 900,
								description: `4-5 zusammenhängende Sätze auf ${langName}, ZUSAMMEN unter 850 Zeichen. Aufbau: Satz 1 = aktuelle Rolle + Jahre Gesamterfahrung. Satz 2 = stärkster fachlicher Schwerpunkt + konkrete Domain. Satz 3 = bemerkenswerte Tenure / Frühere Stationen oder Branchen-Breite. Satz 4 = methodische Stärke oder Tool-Stack. Satz 5 (optional) = Eignung für welchen nächsten Schritt. IMMER mit Punkt enden — niemals mitten im Wort/Satz aufhören. Lieber 1 Satz weglassen als unvollständig schreiben. Stil: souverän, faktisch, ohne Floskeln, ohne 'Teamplayer'-Phrasen.`,
							},
							workStyle: {
								type: "array",
								minItems: 4,
								maxItems: 8,
								items: { type: "string", maxLength: 40 },
								description:
									"4-8 starke Fokus-Themen / Frameworks / Methoden aus dem Profil. Eigennamen original übernehmen ('ISO 27001', 'BSI Grundschutz', 'NIST CSF', 'TISAX', 'SOC 2'). Keine generischen Begriffe wie 'Sicherheit' oder 'IT' — immer das konkrete Framework/die konkrete Norm/das Tool. Wenn das Profil mehrere Branchen abdeckt, je 1 Branchen-Tag erlaubt ('Finance', 'Automotive'). Keine Soft-Skills.",
							},
							strengths: {
								type: "array",
								minItems: 5,
								maxItems: 10,
								items: { type: "string", maxLength: 160 },
								description:
									"5-10 konkrete Wissens-/Erfahrungs-Punkte als VOLLE Sätze mit Kontext (Jahre, Scope, Domain, Werkzeug). Vermeide Wiederholungen aus workStyle — diese Punkte sollen TIEFER gehen. Beispiele guter Punkte: '5 Jahre Threat Modeling im Finance-Umfeld mit STRIDE/PASTA', 'Mehrere ISO-27001-Audits federführend begleitet (Erstzertifizierung + Re-Audits)', 'Business Continuity Planning für 1.000+-MA-Unternehmen inkl. BIA und RTO/RPO-Definition', 'Aufbau eines SOC mit Splunk + Cortex XSOAR'. Schlecht: 'Threat Modeling' (zu kurz, keine Tiefe).",
							},
						},
						required: ["summary", "workStyle", "strengths"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_narrative" },
			messages: [
				{
					role: "user",
					content:
						`Erstelle eine Kandidaten-Lesart für eine:n Arbeitgeber:in. Datenbasis (alles berechnet, keine Selbstbeschreibung):\n\n` +
						`- Aktueller Titel: ${input.headline ?? "—"}\n` +
						`- Selbst-Summary: ${input.summary?.slice(0, 1200) ?? "—"}\n` +
						`- GESAMT-Berufsjahre (inkl. aktueller Rolle, Stand ${input.asOf}): ${input.yearsActive}\n` +
						`- Davon vor der aktuellen Rolle: ${input.previousYearsBeforeCurrent} Jahre\n` +
						`- Längste durchgehende Phase: ${input.yearsContinuous} Jahre\n` +
						`- Anzahl Stationen: ${input.totalRoles}\n` +
						(input.currentRole
							? `- Aktuelle Rolle: ${input.currentRole.role} bei ${input.currentRole.company} seit ${Math.round(
									input.currentRole.monthsOngoing / 12,
								)} Jahren (Teil der GESAMT-Jahre)\n`
							: "") +
						(input.firstJobYear
							? `- Erster Job: ${input.firstJobYear}\n`
							: "") +
						`- Lücken im Werdegang: ${input.gaps}\n` +
						`- Top-Skills: ${input.skills.slice(0, 16).join(", ") || "—"}\n` +
						`- Zertifikate gesamt: ${input.certificateCount} (Muster: ${input.certificatePattern})\n\n` +
						`WICHTIG zur Jahres-Semantik:\n` +
						`  Die "GESAMT-Berufsjahre" enthalten die aktuelle Rolle bereits.\n` +
						`  Wenn du sie erwähnst, schreibe "insgesamt X Jahre", NIEMALS "zuvor X Jahre".\n` +
						`  Nur die "${input.previousYearsBeforeCurrent} Jahre vor der aktuellen Rolle" dürfen als "davor"/"zuvor" formuliert werden.\n\n` +
						`WICHTIG zur Keyword-Auswahl (workStyle + strengths):\n` +
						`  Nimm die TATSÄCHLICHEN Skills/Frameworks/Normen aus dem Profil — kein Hinzudichten. ` +
						`Wenn der Kandidat ISO 27001 + BSI Grundschutz + NIST CSF nennt, müssen ALLE drei in workStyle stehen — nicht nur eine Stichprobe. ` +
						`In strengths verbindest du Skill mit Kontext: "Wie viele Jahre? In welcher Branche? Mit welchem Tool?". ` +
						`Wenn der CV das nicht hergibt, sei vorsichtig und kennzeichne Schätzungen mit "vermutlich" / "laut Selbstangabe".\n\n` +
						`Schreibe sachlich, ohne Floskeln. Keine "Teamplayer"-Phrasen ohne Beleg. Wenn Daten dünn sind, sag das ehrlich. ` +
						`Vermeide Wertungen wie "exzellent". Speichere via save_narrative.\n\n` +
						`SPRACHE: summary, workStyle und strengths MÜSSEN vollständig auf ${langName} formuliert sein. ` +
						`Eigennamen, Firmen, Normen und Frameworks (ISO 27001, NIST CSF, VDMA, …) bleiben unverändert.`,
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			// Graceful fallback: return a minimal, honest narrative.
			return {
				summary:
					input.locale === "en"
						? "Profile summary currently unavailable."
						: "Profil-Zusammenfassung gerade nicht verfügbar.",
				workStyle: [],
				strengths: [],
			};
		}
		const raw = toolUse.input as CandidateNarrative;
		return {
			summary: finishSentence(raw.summary ?? ""),
			workStyle: (raw.workStyle ?? []).map((s) => s.trim()).filter(Boolean),
			strengths: (raw.strengths ?? [])
				.map((s) => finishSentence(s.trim()))
				.filter(Boolean),
		};
	}

	async extractJobPosting(
		bytes: Uint8Array,
		mime: string,
	): Promise<ExtractedJobPosting> {
		const isImage = SUPPORTED_IMAGE_MIME.has(mime);
		const isPdf = mime === "application/pdf";
		if (!isImage && !isPdf) {
			throw new Error(`Unsupported MIME for job posting: ${mime}`);
		}
		const base64 = Buffer.from(bytes).toString("base64");
		const documentBlock = isImage
			? {
					type: "image" as const,
					source: {
						type: "base64" as const,
						media_type: mime as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
						data: base64,
					},
				}
			: {
					type: "document" as const,
					source: {
						type: "base64" as const,
						media_type: "application/pdf" as const,
						data: base64,
					},
				};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 4096,
			tools: [
				{
					name: "save_job",
					description:
						"Save the structured job posting extracted from the document.",
					input_schema: {
						type: "object" as const,
						properties: {
							title: { type: "string", maxLength: 200 },
							description: {
								type: "string",
								maxLength: 6000,
								description:
									"Full role description in the document's language. Keep formatting if helpful (bullets ok). Strip company-confidential parts.",
							},
							location: { type: "string", maxLength: 120 },
							remotePolicy: {
								type: "string",
								enum: ["onsite", "hybrid", "remote"],
							},
							employmentType: {
								type: "string",
								enum: ["fulltime", "parttime", "contract", "internship"],
							},
							salaryMin: {
								type: "integer",
								description:
									"Annual € minimum if stated. Convert ranges. Skip if not in document.",
							},
							salaryMax: { type: "integer" },
							yearsExperienceMin: {
								type: "integer",
								minimum: 0,
								maximum: 40,
							},
							languages: {
								type: "array",
								items: { type: "string", maxLength: 40 },
							},
							requirements: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										weight: { type: "string", enum: ["must", "nice"] },
										minLevel: { type: "integer", minimum: 1, maximum: 5 },
									},
									required: ["name", "weight"],
								},
							},
						},
						required: ["title", "description"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_job" },
			messages: [
				{
					role: "user",
					content: [
						documentBlock,
						{
							type: "text" as const,
							text:
								"Extract this job posting into structured fields.\n\n" +
								"- title + description always required\n" +
								"- For requirements, mark hard skills explicit in the doc as 'must', " +
								"nice-to-haves as 'nice'. Up to ~8 entries — be concrete (frameworks, " +
								"languages, tools), not buzzwords.\n" +
								"- salary fields only when an explicit € amount is stated\n" +
								"- skip fields that aren't clearly in the document",
						},
					],
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude did not return a tool_use block for job posting");
		}
		return toolUse.input as ExtractedJobPosting;
	}

	async benchmarkSalary(input: SalaryBenchmarkInput): Promise<SalaryBenchmark> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 600,
			tools: [
				{
					name: "save_benchmark",
					description: "Save the estimated annual salary range in EUR.",
					input_schema: {
						type: "object" as const,
						properties: {
							low: {
								type: "integer",
								minimum: 20000,
								description: "Lower bound, EUR/yr gross.",
							},
							high: {
								type: "integer",
								description: "Upper bound, EUR/yr gross.",
							},
							rationale: {
								type: "string",
								maxLength: 200,
								description:
									"Eine deutsche Sentence: warum dieser Bereich plausibel ist. Hinweis auf Unsicherheit, falls Daten dünn.",
							},
						},
						required: ["low", "high", "rationale"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_benchmark" },
			messages: [
				{
					role: "user",
					content:
						"Schätze den marktüblichen Brutto-Jahresgehalt-Bereich in EUR für folgende Stelle. " +
						"Berücksichtige Region, Erfahrungsstufe, Stack, Remote-Anteil. Gib einen 25.-/75.-Percentil-Range, keinen Median.\n\n" +
						`Titel: ${input.title}\n` +
						`Beschreibung-Auszug: ${input.description.slice(0, 500)}\n` +
						`Standort: ${input.location ?? "—"}\n` +
						`Modus: ${input.remote}\n` +
						`Mindest-Erfahrung: ${input.yearsRequired} Jahre\n` +
						`Level: ${input.level ?? "—"}\n` +
						`Skills: ${input.requirements.join(", ") || "—"}\n\n` +
						"Schreib die rationale auf Deutsch, sachlich, max 1 Satz. Speichere via save_benchmark.",
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			return {
				low: 0,
				high: 0,
				currency: "EUR",
				rationale: "Schätzung gerade nicht verfügbar.",
			};
		}
		const out = toolUse.input as {
			low: number;
			high: number;
			rationale: string;
		};
		return { ...out, currency: "EUR" };
	}

	async assessMatch(input: MatchAssessmentInput): Promise<MatchAssessment> {
		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 600,
			tools: [
				{
					name: "save_assessment",
					description: "Save the pro/con assessment of this match.",
					input_schema: {
						type: "object" as const,
						properties: {
							pros: {
								type: "array",
								maxItems: 4,
								items: { type: "string", maxLength: 140 },
								description:
									"2-4 konkrete Pro-Punkte auf Deutsch. Belege mit Skills, Jahren, Erfahrung. Keine Floskeln.",
							},
							cons: {
								type: "array",
								maxItems: 4,
								items: { type: "string", maxLength: 140 },
								description:
									"2-4 ehrliche Bedenken oder Lücken. Wenn nichts wirklich fehlt: 'Keine offensichtlichen Schwächen.'",
							},
							experienceVerdict: {
								type: "string",
								maxLength: 80,
								description:
									"Ein Satz: Erfahrungs-Vergleich. Z. B. '9 J. — 3 mehr als gefordert' oder '4 J. — 2 unter Anforderung'.",
							},
						},
						required: ["pros", "cons", "experienceVerdict"],
					},
				},
			],
			tool_choice: { type: "tool", name: "save_assessment" },
			messages: [
				{
					role: "user",
					content:
						"Bewerte diesen Match aus Arbeitgeber-Sicht. Pro/Con + 1-Satz-Erfahrungsverdict.\n\n" +
						`Stelle: ${input.jobTitle}\n` +
						`Stelle-Beschreibung: ${input.jobDescription.slice(0, 400)}\n` +
						`Mindest-Erfahrung: ${input.yearsRequired} Jahre\n` +
						`Kandidat: ${input.candidateHeadline ?? "—"}\n` +
						`Kandidat-Summary: ${input.candidateSummary ?? "—"}\n` +
						`Kandidat-Erfahrung: ${input.candidateYears ?? 0} Jahre\n` +
						`Match-Skills: ${input.matchedSkills.join(", ") || "—"}\n` +
						`Adjacent (Quereinstieg): ${input.adjacentSkills.join(", ") || "—"}\n` +
						`Fehlt: ${input.missingSkills.join(", ") || "—"}\n\n` +
						"Sei direkt. Floskeln raus. Speichere via save_assessment.",
				},
			],
		});
		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			return {
				pros: [],
				cons: [],
				experienceVerdict: `${input.candidateYears ?? 0} J.`,
			};
		}
		return toolUse.input as MatchAssessment;
	}

	async matchRationale(input: MatchRationaleInput): Promise<string> {
		const prompt =
			`Du erklärst in einem Satz (max 30 Wörter), warum dieser Kandidat zu dieser Stelle passt.\n\n` +
			`Stelle: ${input.jobTitle}\n` +
			`Beschreibung-Auszug: ${input.jobDescription.slice(0, 500)}\n` +
			`Kandidat: ${input.candidateHeadline ?? "—"}\n` +
			`Profil: ${input.candidateSummary ?? "—"}\n` +
			`Skills die matchen: ${input.matchedSkills.join(", ") || "—"}\n` +
			`Skills die fehlen: ${input.missingSkills.join(", ") || "—"}\n` +
			`Erfahrung: ${input.yearsExperience ?? "?"} Jahre (gefordert: ${input.yearsRequired ?? 0}).\n\n` +
			`Schreib einen Satz auf Deutsch, sachlich, konkret. Keine Floskeln.`;

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 200,
			messages: [{ role: "user", content: prompt }],
		});
		const text = result.content
			.filter((b) => b.type === "text")
			.map((b) => (b.type === "text" ? b.text : ""))
			.join(" ")
			.trim();
		return text || "Profil und Stelle passen inhaltlich.";
	}

	async gradeOpenAnswer(input: {
		question: string;
		rubric: string | null;
		answer: string;
		maxPoints: number;
	}): Promise<{ pointsEarned: number; feedback: string }> {
		const sys = `Du bewertest die Antwort einer Person auf eine Bewerbungs-Assessment-Frage. Vergib ganzzahlige Punkte (0-${input.maxPoints}) gemäß der Rubrik. Antworte streng als JSON: {"points": <int>, "feedback": "<1-2 Sätze konstruktiv auf Deutsch>"}.`;
		const user = [
			`Frage: ${input.question}`,
			`Rubrik: ${input.rubric ?? "(keine — bewerte fachliche Substanz, Klarheit, konkrete Beispiele)"}`,
			`Antwort der Bewerbenden: ${input.answer}`,
			`Maximalpunkte: ${input.maxPoints}`,
		].join("\n");
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 300,
				system: sys,
				messages: [{ role: "user", content: user }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\{[\s\S]*\}/);
			if (m) {
				const parsed = JSON.parse(m[0]) as {
					points?: number;
					feedback?: string;
				};
				const pts = Math.max(
					0,
					Math.min(input.maxPoints, Math.round(parsed.points ?? 0)),
				);
				return {
					pointsEarned: pts,
					feedback: parsed.feedback ?? "Bewertet.",
				};
			}
		} catch (e) {
			console.error("[ai] gradeOpenAnswer failed", e);
		}
		return { pointsEarned: 0, feedback: "Konnte nicht bewertet werden." };
	}

	async suggestAssessmentQuestions(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
	}) {
		const sys = `Du formulierst 5 kurze Assessment-Fragen für eine Stellenausschreibung. Mix: 3 Multiple-Choice (mit genau einer richtigen Antwort + 2-3 Distraktoren) und 2 offene Fragen (mit kurzer Bewertungs-Rubrik). Antworte streng als JSON-Array, kein Markdown, kein Prosa.

Schema pro Eintrag:
- {"kind":"mc","body":"...","choices":[{"text":"...","weight":N},...],"correctChoice":<int>,"maxPoints":<1-3>}
- {"kind":"open","body":"...","rubric":"...","maxPoints":<3-5>}`;
		const user = [
			`Stellentitel: ${input.title}`,
			`Beschreibung: ${input.description}`,
			`Anforderungen: ${input.requirements.map((r) => `${r.name} (${r.weight})`).join(", ")}`,
		].join("\n");
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 2000,
				system: sys,
				messages: [{ role: "user", content: user }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\[[\s\S]*\]/);
			if (m) {
				return JSON.parse(m[0]);
			}
		} catch (e) {
			console.error("[ai] suggestAssessmentQuestions failed", e);
		}
		return [];
	}

	async analyzeCareerProspects(input: {
		profile: ExtractedProfile;
		yearsActive?: number;
		insights?: unknown;
		locale?: "de" | "en";
	}): Promise<CareerAnalysis> {
		const locale: "de" | "en" = input.locale ?? "de";
		const languageName = locale === "en" ? "English" : "German";
		// Tight caps: jede Liste auf max 4-5 Einträge, jede rationale unter
		// 180 Zeichen. Das reduziert die Output-Tokens deutlich und damit die
		// API-Latenz — wichtig damit wir unter Reverse-Proxy-Timeouts (nginx
		// default 60s) bleiben.
		const careerSchema = {
			type: "object" as const,
			properties: {
				language: { type: "string", enum: ["de", "en"] },
				headline: { type: "string", maxLength: 400 },
				strengths: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: { type: "string", maxLength: 140 },
				},
				growthAreas: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: { type: "string", maxLength: 140 },
				},
				salary: {
					type: "object",
					properties: {
						low: { type: "integer", minimum: 0 },
						mid: { type: "integer", minimum: 0 },
						high: { type: "integer", minimum: 0 },
						currency: { type: "string" },
						rationale: { type: "string", maxLength: 300 },
					},
					required: ["low", "mid", "high", "currency", "rationale"],
				},
				primaryIndustries: {
					type: "array",
					minItems: 2,
					maxItems: 5,
					items: { type: "string", maxLength: 40 },
				},
				adjacentIndustries: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: {
						type: "object",
						properties: {
							name: { type: "string", maxLength: 40 },
							rationale: { type: "string", maxLength: 180 },
						},
						required: ["name", "rationale"],
					},
				},
				certificationSuggestions: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: {
						type: "object",
						properties: {
							name: { type: "string", maxLength: 80 },
							issuer: { type: "string", maxLength: 40 },
							why: { type: "string", maxLength: 180 },
							effortHours: { type: "integer", minimum: 0 },
						},
						required: ["name", "issuer", "why", "effortHours"],
					},
				},
				roleSuggestions: {
					type: "array",
					minItems: 3,
					maxItems: 5,
					items: {
						type: "object",
						properties: {
							title: { type: "string", maxLength: 60 },
							rationale: { type: "string", maxLength: 180 },
							obvious: { type: "boolean" },
						},
						required: ["title", "rationale", "obvious"],
					},
				},
				hiringPros: {
					type: "array",
					minItems: 3,
					maxItems: 4,
					items: { type: "string", maxLength: 140 },
				},
				hiringCons: {
					type: "array",
					minItems: 2,
					maxItems: 4,
					items: { type: "string", maxLength: 140 },
				},
				marketContext: {
					type: "object",
					properties: {
						demand: { type: "string", enum: ["high", "medium", "low"] },
						notes: { type: "string", maxLength: 300 },
					},
					required: ["demand", "notes"],
				},
			},
			required: [
				"headline",
				"strengths",
				"growthAreas",
				"salary",
				"primaryIndustries",
				"adjacentIndustries",
				"certificationSuggestions",
				"roleSuggestions",
				"hiringPros",
				"hiringCons",
				"marketContext",
			],
		};

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 2500,
			// Niedrige Temperature für Konsistenz — gleicher Input soll
			// ähnlichen Output liefern statt 'jedes mal neue Werte'.
			temperature: 0.3,
			tools: [
				{
					name: "save_career_analysis",
					description:
						"Speichert die Karriere-Analyse für den/die Bewerber:in. Sei konkret und marktnah (DACH 2026), nicht generisch — keine Buzzwords, klare Begründungen. headline ist 1 kurzer Absatz (max 60 Wörter). Halte ALLE Listen knapp (3-5 Einträge je). adjacentIndustries sind nicht-offensichtliche Branchen-Treffer. roleSuggestions: `obvious=true` für naheliegende Rollen, `obvious=false` für überraschende. salary in EUR.",
					input_schema: careerSchema,
				},
			],
			tool_choice: { type: "tool", name: "save_career_analysis" },
			system:
				`You are an experienced career coach with DACH market knowledge as of 2026. Reply exclusively through the save_career_analysis tool. ` +
				`MOST IMPORTANT: ALL prose fields (headline, rationales, salary.rationale, marketContext.notes, hiringPros, hiringCons, strengths, growthAreas, certificationSuggestions.why, roleSuggestions.rationale, adjacentIndustries.rationale) MUST be written in ${languageName}. ` +
				`Industry names and role titles also in ${languageName} where natural, but keep certification names (e.g. ISO 27001, CISSP) and brand names in their canonical form. ` +
				`Set the 'language' field to '${locale}'. ` +
				`You MUST fill EVERY field — never leave any list empty. If a field looks thin, derive plausible values from the available skills/experience/education. ` +
				`Write AS SHORT AS POSSIBLE within the maxLength limits — depth over breadth, no repetition.`,
			messages: [
				{
					role: "user",
					content:
						`Datenbasis für die Karriere-Analyse:\n\n` +
						`PROFIL:\n${JSON.stringify(input.profile, null, 2)}\n\n` +
						(input.yearsActive
							? `GESAMT-Berufsjahre: ${input.yearsActive}\n\n`
							: "") +
						(input.insights
							? `BERECHNETE INSIGHTS (Tenure, Zertifikats-Analytics, Narrative):\n${JSON.stringify(
									input.insights,
									null,
									2,
								).slice(0, 6000)}\n\n`
							: "") +
						`Pflicht-Output (über save_career_analysis):\n` +
						`- headline: 1 Absatz max 60 Wörter, fasst Profil zusammen.\n` +
						`- strengths: 3-5 KONKRETE Stärken mit Beleg (Jahre, Domain, Tool).\n` +
						`- growthAreas: 3-5 ehrliche Lücken/Wachstumsfelder.\n` +
						`- salary: EUR-Band für DACH-Markt mit kurzer rationale.\n` +
						`- primaryIndustries: 2-5 offensichtliche Branchen-Treffer.\n` +
						`- adjacentIndustries: 2-4 NICHT-offensichtliche Branchen mit kurzer Begründung warum sie passen.\n` +
						`- certificationSuggestions: 2-4 sinnvolle Zertifikate für nächsten Karriere-Schritt (Name + Issuer + Aufwand-Stunden + Begründung).\n` +
						`- roleSuggestions: 3-5 Rollen-Titel (mix aus obvious=true + obvious=false), jeweils kurze rationale.\n` +
						`- hiringPros: 3-4 Argumente für eine Einstellung dieses Profils.\n` +
						`- hiringCons: 2-4 ehrliche Argumente dagegen / Risiken.\n` +
						`- marketContext: demand-Level + 2-3 Sätze Markt-Notes.\n\n` +
						`Jedes Feld muss gefüllt sein — wenn die Daten dünn sind, formuliere vorsichtig ("vermutlich", "abhängig von …"), aber liefere ab.`,
				},
			],
		});

		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude hat keinen tool_use-Block geliefert");
		}
		const out = toolUse.input as CareerAnalysis;
		// Force-set language falls das Modell das Feld vergessen hat —
		// damit Locale-Mismatch-Detection im UI verlässlich ist.
		return { ...out, language: locale };
	}

	async assessJobPostingQuality(input: {
		title: string;
		description: string;
		requirements: { name: string; weight: "must" | "nice" }[];
		salaryMin: number | null;
		salaryMax: number | null;
		remotePolicy: string;
	}): Promise<JobPostingQuality> {
		const sys = `Du bewertest Stellenanzeigen aus Bewerber-Sicht. Gib JSON zurück: {"score":<0-100>,"completeness":<0-100>,"clarity":<0-100>,"redFlags":["..."],"suggestions":["..."]}. Konkret, nicht generisch.`;
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 1200,
				system: sys,
				messages: [{ role: "user", content: JSON.stringify(input) }],
			});
			const text = result.content
				.flatMap((b) => (b.type === "text" ? [b.text] : []))
				.join("")
				.trim();
			const m = text.match(/\{[\s\S]*\}/);
			if (m) return JSON.parse(m[0]) as JobPostingQuality;
		} catch (e) {
			console.error("[ai] assessJobPostingQuality failed", e);
		}
		return {
			score: 50,
			completeness: 50,
			clarity: 50,
			redFlags: [],
			suggestions: [],
		};
	}

	async translateProfile(
		input: ProfileTranslationInput,
	): Promise<ProfileTranslationOutput> {
		if (input.from === input.to) {
			return passthroughTranslation(input);
		}

		const targetLang = input.to === "de" ? "Deutsch" : "Englisch";
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 6000,
				tools: [
					{
						name: "save_translation",
						description: `Save the translated profile in ${targetLang}.`,
						input_schema: {
							type: "object" as const,
							properties: {
								headline: { type: "string" },
								summary: { type: "string" },
								industries: { type: "array", items: { type: "string" } },
								languages: { type: "array", items: { type: "string" } },
								skills: {
									type: "array",
									items: {
										type: "object",
										properties: {
											name: { type: "string" },
											level: { type: "number" },
										},
										required: ["name"],
									},
								},
								experience: {
									type: "array",
									items: {
										type: "object",
										properties: {
											role: { type: "string" },
											description: { type: "string" },
										},
										required: ["role"],
									},
								},
								education: {
									type: "array",
									items: {
										type: "object",
										properties: {
											degree: { type: "string" },
											thesisTitle: { type: "string" },
											focus: { type: "string" },
										},
										required: ["degree"],
									},
								},
								awards: { type: "array", items: { type: "string" } },
								mobility: { type: "string" },
								projects: {
									type: "array",
									items: {
										type: "object",
										properties: {
											name: { type: "string" },
											role: { type: "string" },
											description: { type: "string" },
										},
										required: ["name"],
									},
								},
								publications: {
									type: "array",
									items: {
										type: "object",
										properties: {
											title: { type: "string" },
											venue: { type: "string" },
										},
										required: ["title"],
									},
								},
								volunteering: {
									type: "array",
									items: {
										type: "object",
										properties: {
											organization: { type: "string" },
											role: { type: "string" },
											description: { type: "string" },
										},
										required: ["organization", "role"],
									},
								},
							},
						},
					},
				],
				tool_choice: { type: "tool", name: "save_translation" },
				messages: [
					{
						role: "user",
						content:
							`Übersetze das folgende Kandidat:innen-Profil ins ${targetLang}. ALLE Freitext-Felder müssen übersetzt werden, inklusive Projekt-Beschreibungen, Publikations-Titel, Ehrenamt-Beschreibungen, Studienschwerpunkte und Abschlussarbeit-Titel.\n\n` +
							`Regeln:\n` +
							`- Personennamen, Firmennamen, Universitäts-/Schulnamen, Konferenz-/Journal-Namen, Standorte UNVERÄNDERT lassen.\n` +
							`- Feststehende Bezeichnungen (ISO 27001, AWS, NIST CSF, AZ-104, ITIL, BSI Grundschutz, CISSP, …) UNVERÄNDERT lassen.\n` +
							`- Berufsbezeichnungen sinnvoll übersetzen (z. B. "Vertriebsleiter" ↔ "Sales Manager"), aber etablierte Anglizismen behalten ("Information Security Officer", "Product Owner", "Scrum Master").\n` +
							`- Studien-Abschlüsse: "Bachelor of Science" / "B.Sc." behalten; "Bachelor (Wirtschaftsinformatik)" wird zu "Bachelor (Business Informatics)" auf EN.\n` +
							`- Beschreibungstexte natürlich übersetzen — nicht wörtlich, aber faktentreu. Auch Aufzählungen mit Semikolon-Trennern beibehalten.\n` +
							`- Skill-Levels nicht verändern.\n` +
							`- Industries / Awards / Mobility ebenfalls übersetzen sofern es sich nicht um Eigennamen handelt.\n` +
							`- Languages: ÜBERSETZEN. "Deutsch" → "German", "Englisch" → "English", "Französisch" → "French", "Spanisch" → "Spanish", "Italienisch" → "Italian", "Niederländisch" → "Dutch", "Polnisch" → "Polish", "Russisch" → "Russian", "Türkisch" → "Turkish", "Arabisch" → "Arabic", "Chinesisch" → "Chinese", "Japanisch" → "Japanese". Falls als BCP47-Code wie "de:native" oder "en:c1" gespeichert, Code UNVERÄNDERT lassen — der Code ist sprach-unabhängig.\n\n` +
							`Quelle:\n${JSON.stringify(input, null, 2)}`,
					},
				],
			});
			const toolUse = result.content.find((b) => b.type === "tool_use");
			if (toolUse?.type === "tool_use") {
				return toolUse.input as ProfileTranslationOutput;
			}
		} catch (e) {
			console.warn("[ai] translateProfile failed", e);
		}
		// Fallback: 1:1 zurückgeben, lieber nichts übersetzen als falsch.
		return passthroughTranslation(input);
	}

	async recommendCandidateSalary(input: {
		profile: ExtractedProfile;
		country: string;
		currency: string;
		priorEvaluations?: {
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		}[];
	}): Promise<{
		low: number;
		mid: number;
		high: number;
		currency: string;
		rationale: string;
	}> {
		const schema = {
			type: "object" as const,
			properties: {
				low: { type: "integer", minimum: 0 },
				mid: { type: "integer", minimum: 0 },
				high: { type: "integer", minimum: 0 },
				currency: { type: "string" },
				rationale: { type: "string", maxLength: 400 },
			},
			required: ["low", "mid", "high", "currency", "rationale"],
		};

		const priorBlock =
			input.priorEvaluations && input.priorEvaluations.length > 0
				? `\n\nVORHERIGE EMPFEHLUNGEN für diesen Kandidaten + Land (neueste zuerst):\n${input.priorEvaluations
						.slice(0, 3)
						.map(
							(p, i) =>
								`  #${i + 1}: ${p.low}-${p.mid}-${p.high} ${p.currency}. Rationale: ${p.rationale.slice(0, 200)}`,
						)
						.join(
							"\n",
						)}\n\nHalte dich an dieses Band (±10%) als Anker, sofern sich am Profil nichts Signifikantes geändert hat. Weiche nur ab wenn neue Skills/Erfahrungs-Jahre/Branchen-Wechsel das rechtfertigen — und erwähne dann KURZ warum in der rationale.`
				: "";

		const result = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: 800,
			// Niedrige Temperature für Konsistenz — gleicher Input soll
			// (annähernd) gleichen Output liefern. 0.2 statt Default (1.0).
			temperature: 0.2,
			tools: [
				{
					name: "save_country_salary",
					description:
						"Empfohlenes Brutto-Jahresgehalt in der gewünschten Währung für genau dieses Profil und genau dieses Land. Berücksichtige Skill-Mix, Erfahrung, lokales Lohnniveau und ortsübliche Beschäftigungs-Konditionen. low/mid/high als Brutto pro Jahr (USA: vor Bonus). Rationale: 1-2 Sätze, was den Bereich rechtfertigt.",
					input_schema: schema,
				},
			],
			tool_choice: { type: "tool", name: "save_country_salary" },
			system:
				"Du kennst die DACH/EU/UK/US-Gehaltsmärkte (Stand 2026). Antworte ausschliesslich über das save_country_salary-Tool. Keine Buzzwords, keine Marketing-Sprache. Wenn vorherige Empfehlungen vorliegen, behandle sie als Anker — bleibe in der Nähe sofern das Profil nicht signifikant gewachsen ist.",
			messages: [
				{
					role: "user",
					content:
						JSON.stringify({
							profile: input.profile,
							country: input.country,
							currency: input.currency,
						}) + priorBlock,
				},
			],
		});
		const toolUse = result.content.find((b) => b.type === "tool_use");
		if (!toolUse || toolUse.type !== "tool_use") {
			throw new Error("Claude hat keinen tool_use-Block geliefert");
		}
		const out = toolUse.input as {
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		};
		return out;
	}

	// Generische Text-Übersetzung für UI-Translate-on-demand. Bei Fehler
	// werden die Originale zurückgegeben — NIEMALS throw.
	async translateTexts(input: {
		texts: string[];
		from: "de" | "en";
		to: "de" | "en";
		context?: string;
	}): Promise<string[]> {
		if (input.texts.length === 0) return [];
		if (input.from === input.to) return input.texts;
		const targetLang = input.to === "de" ? "Deutsch" : "Englisch";
		const schema = {
			type: "object" as const,
			properties: {
				translations: { type: "array", items: { type: "string" } },
			},
			required: ["translations"],
		};
		try {
			const result = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 1024,
				tools: [
					{
						name: "save_translations",
						description: `Speichert die Übersetzungen ins ${targetLang}. Reihenfolge = Eingabe-Reihenfolge. Eigennamen, Firmen, Personennamen, Standorte und feststehende Skill-Bezeichnungen (ISO 27001, AWS, NIST CSF, AZ-104, ITIL, …) UNVERÄNDERT lassen. Bei zusammengesetzten Wörtern echte Begriffe verwenden — niemals erfundene Komposita. Wenn ein Eingabe-String leer ist, gib einen leeren String zurück.`,
						input_schema: schema,
					},
				],
				tool_choice: { type: "tool", name: "save_translations" },
				system:
					"Du bist Übersetzer. Antworte ausschliesslich über das save_translations-Tool. Halte dich strikt an die Eingabe-Reihenfolge.",
				messages: [
					{
						role: "user",
						content:
							(input.context ? `Kontext: ${input.context}\n\n` : "") +
							`Übersetze ins ${targetLang}:\n\n${JSON.stringify(input.texts)}`,
					},
				],
			});
			const toolUse = result.content.find((b) => b.type === "tool_use");
			if (!toolUse || toolUse.type !== "tool_use") return input.texts;
			const out = (toolUse.input as { translations?: unknown[] }).translations;
			if (!Array.isArray(out)) return input.texts;
			return input.texts.map((orig, i) => {
				const t = out[i];
				return typeof t === "string" && t.length > 0 ? t : orig;
			});
		} catch (e) {
			console.warn("[ai] translateTexts failed, returning originals", e);
			return input.texts;
		}
	}
}
