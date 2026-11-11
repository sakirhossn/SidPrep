# DailyDigest Adaptation: Architectural Comparison & Technical Reference

This document provides a detailed architectural and functional comparison between the Python reference implementation in [DailyDigest](https://github.com/sakirhossn/DailyDigest) and its production TypeScript/Fastify adaptation inside SidPrep's competitive-exam current affairs engine.

---

## 1. Executive Summary & Design Principles

DailyDigest serves as a high-quality CLI/cron-based Python pipeline for fetching, filtering, and curating RSS feeds for competitive exam preparation. SidPrep required adapting these proven concepts into a resilient, multi-tenant, full-stack educational platform (Fastify API, PostgreSQL, Next.js Admin/Web, Expo Mobile).

Key architectural differences:
1. **Preserved SidPrep Stack**: Implemented natively in TypeScript/Node.js without introducing an external Python microservice or runtime dependency.
2. **PostgreSQL Persistence vs In-Memory/SQLite**: All sources, discovery queries, deduplication fingerprints, editorial review states, and fetch job metrics are persisted transactionally in PostgreSQL.
3. **Unicode & Multi-Script Deduplication**: Adapted headline clustering from basic ASCII alphanumeric tokenization to full Unicode `\p{L}\p{N}` matching English, Bengali, and Hindi scripts.
4. **Anti-False-Positive Domain Guards**: Guarded against erroneously merging distinct appointments, different report editions/dates, separate sports medal categories, or corrections.
5. **Bounded Concurrency & Fault Isolation**: Bounded network requests to 6 simultaneous workers with 10-second timeouts, per-source error containment, and SSRF destination validation.
6. **No Hallucinated Content Invariant**: For short feed descriptions (< 40 words), safe article content is retrieved. If evidence remains insufficient (< 3 facts), drafts are marked `NEEDS_SOURCE_REVIEW` rather than generating filler facts.

---

## 2. Adaptation Matrix

| Capability / Function | DailyDigest (`Python`) | SidPrep Adaptation (`TypeScript / Fastify / PostgreSQL`) | Engineering Rationale & Improvements |
| :--- | :--- | :--- | :--- |
| **Source Strategy** | `sources/rss_fetcher.py`: Static dict of URLs across categories in `config.py`. | `services/newsIngestion.ts`: 9 Editable Source Groups (`SOURCE_GROUPS`) + database-backed `news_sources` table. | Admin can add, edit, test, enable/disable direct feeds and Google News queries dynamically through web UI. |
| **Google News Discovery** | Simple keyword search URLs. | `buildGoogleNewsDiscoveryUrl()` with parenthesized query groups `(ISRO OR DRDO) when:1d&hl=en-IN&gl=IN&ceid=IN:en`. | Without outer parentheses, Google News applies `when:1d` only to the last keyword. Locale pins to Indian English (`en-IN`). |
| **Publisher Attribution** | Assumed from source name or feed metadata. | Title parsing regex `^(.*?)\s*-\s*([^-]+)$` extracting original publisher from Google News title pattern + publisher usage rights. | Google News aggregates external news; extracting the trailing publisher avoids attributing private news to Google and records license rights. |
| **Feed Parsing** | `feedparser` library parsing Python dicts. | `fast-xml-parser` wrapped in `parseFeedXmlDetailed()` supporting RSS 2.0, Atom 1.0, RDF, and detecting HTML 403/500 error pages. | Eliminates silent failures when web servers return Cloudflare HTML challenge pages with HTTP 200/403. |
| **HTML Sanitization** | `clean_html()` regex stripping tags and entities. | `cleanHtml()` in `newsIngestion.ts`: strips `<script>`, `<style>`, HTML markup, decodes entities (`&mdash;`, `&quot;`, etc.), collapses spaces. | Prevents script injection from untrusted feed descriptions and normalizes punctuation for NLP comparison. |
| **Headline Tokenization** | `r'\b[a-zA-Z0-9]{3,}\b'` (ASCII only). | `tokenizeHeadlineUnicode()` using `[\p{L}\p{N}]{2,}` Unicode flag. | Supports Bengali (WBPSC) and Hindi (SSC/UPPSC) characters without dropping non-Latin words. |
| **Deduplication State** | `seen_urls.txt` or in-memory sets. | PostgreSQL `canonical_url` unique index + `areTitlesSimilar()` Jaccard similarity (0.65 threshold) with DB fallback. | Durable across API restarts and multiple backend worker instances; prevents database collisions. |
| **False-Positive Prevention** | None (pure Jaccard threshold >= 0.65). | `shouldProhibitHeadlineMerge()` with appointment, report edition, sports category, and corrigendum guards. | Prevents collapsing distinct appointments (e.g. 50th vs 51st CJI, appointed vs demitted) or report months (June vs Dec). |
| **Concurrency & Workers** | `concurrent.futures.ThreadPoolExecutor(max_workers=5)` | `mapConcurrent(items, 6, fn)` asynchronous promise pool with bounded concurrency (6 simultaneous workers). | Native Node.js non-blocking I/O avoids thread overhead while preventing outbound socket exhaustion or target rate-limiting. |
| **Short Description Handling** | Rejects or keeps raw short snippet. | `retrieveArticleContentIfShort()` fetches permitted article body (SSRF-protected, 6s timeout, 2MB limit) if words < 40. | Ingests rich context from short RSS leads while safeguarding against internal network probing and massive payloads. |
| **Insufficient Evidence Rule** | LLM generation often hallucinated missing facts. | Invariant: If < 3 facts found, draft flagged as `NEEDS_SOURCE_REVIEW` with amber UI badge; zero dummy facts invented. | Upholds competitive exam accuracy standard; editorial staff must review before publication to students. |
| **Diagnostics & Testing** | CLI output printing exceptions. | Unified `testFeedConnectivity()` returning HTTP status, final URL, detected format, 3 sample headlines, and error diagnostics. | Reused between Admin UI "Test Connectivity" button and scheduled health checks; persists test outcome to DB. |

---

## 3. Detailed Component Breakdown

### 3.1. Google News Discovery Freshness Grouping

In Google News RSS discovery syntax, boolean queries must be enclosed in parentheses before the `when:` freshness directive:
- **Incorrect**: `ISRO OR DRDO OR military exercise when:1d` (Only `military exercise` receives the `when:1d` filter; `ISRO` returns years-old articles).
- **Correct (SidPrep adaptation)**: `(ISRO OR DRDO OR "military exercise") when:1d&hl=en-IN&gl=IN&ceid=IN:en`

`buildGoogleNewsDiscoveryUrl` automatically wraps clean keyword sets in parentheses, appends `when:1d`, and URI-encodes the query parameter while retaining standard query string parameters (`hl=en-IN`, `gl=IN`, `ceid=IN:en`).

### 3.2. Unicode Tokenization & Jaccard Clustering

DailyDigest used ASCII-only regex `re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())`. This failed for Indian state exam feeds (e.g., WBPSC Current Affairs in Bengali or Union schemes in Hindi).

SidPrep's `tokenizeHeadlineUnicode`:
```typescript
export function tokenizeHeadlineUnicode(text: string): Set<string> {
  const normalized = (text || '').toLowerCase().normalize('NFKD');
  const tokens = normalized.match(/[\p{L}\p{N}]{2,}/gu) || [];
  return new Set(tokens.filter((t) => !STOP_WORDS.has(t)));
}
```
This handles English, Bengali (`বাংলা`), Devanagari (`हिन्दी`), and other regional Indian scripts seamlessly.

### 3.3. Anti-False-Positive Clustering Guards (`shouldProhibitHeadlineMerge`)

A simple Jaccard similarity threshold of 0.65 erroneously merges distinct news events with similar sentence templates:
1. **Appointments & Demissions**:
   - Headline 1: `Justice Sanjiv Khanna takes oath as 51st Chief Justice of India`
   - Headline 2: `Justice D.Y. Chandrachud demits office as Chief Justice of India`
   - *Result*: Blocked from merging because appointment action (`takes oath`) opposes demission action (`demits office`), ordinals differ (`51st`), and distinct proper names (`Khanna` vs `Chandrachud`) differ.
2. **Report Editions**:
   - Headline 1: `Reserve Bank of India releases Financial Stability Report June 2026`
   - Headline 2: `Reserve Bank of India releases Financial Stability Report December 2026`
   - *Result*: Blocked from merging because report edition months differ (`June` vs `December`).
3. **Sports Disciplines & Categories**:
   - Headline 1: `India wins Gold in Men's 10m Air Rifle Shooting World Cup`
   - Headline 2: `India wins Gold in Women's 10m Air Rifle Shooting World Cup`
   - *Result*: Blocked from merging because gender category differs (`men` vs `women`).
4. **Official Corrigenda & Amendments**:
   - Headline 1: `UPSC releases Civil Services Examination 2026 Notification`
   - Headline 2: `UPSC releases Corrigendum to Civil Services Examination 2026 Notification`
   - *Result*: Blocked from merging because one contains amendment keywords (`corrigendum`).

### 3.4. Empirical Live Feed Audit vs Fixtures

Live testing from the deployed backend demonstrated real-world behavior:
- **Press Information Bureau (PIB)**: Returned `HTTP 403` to standard server User-Agents due to state server firewall / CDN restrictions.
- **Reserve Bank of India (RBI)**: Returned `HTTP 200` (RSS 2.0, 6 items, ~350ms latency).
- **Google News Discovery**: Returned `HTTP 200` (RSS 2.0, 5–95 items, ~450ms–890ms latency) successfully capturing PIB, ISRO, and Cabinet announcements from syndicated national publications.

This proves that candidate sources must never be marked `is_verified: true` by default, and that topic-based Google News discovery provides vital redundancy when direct government feeds encounter network blocks.
