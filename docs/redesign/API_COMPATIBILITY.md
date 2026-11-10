# SidPrep 2.0 — API Contract Reconciliation & Compatibility Guide

**Document Version:** 2.0.0  
**Source Matrix:** `03_API_Contract_Reconciliation.csv` & `packages/contracts/openapi.yaml`

---

## 1. Route Reconciliation & Canonical Paths

To avoid breaking existing consumer integrations across Web Admin and Mobile, the Fastify API provides canonical `/v1` endpoints with seamless alias compatibility.

| Category | Mobile Path | Backend Handler | Canonical Route | OpenAPI Status | Dual-Compatible? |
|---|---|---|---|---|---|
| **Student Challenge** | `/v1/auth/otp/request` | `handleStudentChallenge` | `POST /v1/auth/student/challenge` | Documented | Yes (both work) |
| **Student Verify** | `/v1/auth/otp/verify` | `handleStudentVerify` | `POST /v1/auth/student/verify` | Documented | Yes (both work) |
| **Token Refresh** | `/v1/auth/refresh` | `authRoutes` | `POST /v1/auth/refresh` | Added | Yes |
| **Attempt Start** | `/v1/tests/:id/start` | `startAttemptHandler` | `POST /v1/attempts` | Documented | Yes (both work) |
| **Attempt Submit** | `/v1/attempts/:id/submit` | `submitAttempt` | `POST /v1/attempts/:id/submit` | Documented | Yes |
| **Attempt Result** | `/v1/attempts/:id/result` | `getAttemptResult` | `GET /v1/attempts/:id/result` | Added | Yes |
| **Study Task Sync** | `/v1/study-plan/tasks/:id` | `updateStudyTask` | `PATCH /v1/study-plan/tasks/:id` | Added | Yes |
| **Resource Ticket** | `POST /v1/resources/:id/download` | `handleResourceDownload` | `GET/POST /v1/resources/:id/download` | Documented | Yes (both work) |
| **Data Export** | `POST /v1/me/export` | `requestDataExport` | `POST /v1/me/export` | Added | Yes |
| **Data Deletion** | `POST /v1/me/delete` | `requestAccountDeletion` | `POST /v1/me/delete` | Added | Yes |

---

## 2. Request / Response Envelopes

### Student Verification Envelope (`POST /v1/auth/student/verify` and `POST /v1/auth/otp/verify`)
Supports both flat token access and nested `tokens` object:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "tokens": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": 3600
  },
  "expiresIn": 3600,
  "user": {
    "id": "stu_1793816328",
    "email": "student@sidprep.in",
    "preferredLanguage": "en",
    "targetExams": ["SSC_CGL"],
    "dailyGoalMinutes": 45,
    "streakDays": 1,
    "status": "ACTIVE",
    "isEmailVerified": true
  }
}
```

### Attempt Start Envelope (`POST /v1/tests/:id/start` and `POST /v1/attempts`)
Server-authoritative timer parameters:
```json
{
  "attemptId": "att_1793816664",
  "testId": "cgl-mock-01",
  "startedAt": "2026-11-04T18:24:24.283Z",
  "serverTime": "2026-11-04T18:24:24.283Z",
  "expiresAt": "2026-11-04T19:24:24.283Z",
  "durationSeconds": 3600,
  "sections": [
    {
      "id": "sec-gi",
      "name": "General Intelligence & Reasoning",
      "durationMinutes": 60,
      "isLocked": false,
      "questionsCount": 25,
      "totalMarks": 50,
      "negativeMarkRate": 0.5
    }
  ],
  "questions": [
    {
      "id": "q_cgl_01",
      "sectionId": "sec-gi",
      "sequence": 1,
      "text": "Select the related word from given alternatives: Book : Reading :: Fork : ?",
      "options": [
        { "id": "opt_a", "text": "Eating" },
        { "id": "opt_b", "text": "Kitchen" },
        { "id": "opt_c", "text": "Spoon" },
        { "id": "opt_d", "text": "Plate" }
      ],
      "positiveMarks": 2.0,
      "negativeMarks": 0.5
    }
  ],
  "savedAnswers": []
}
```

### Attempt Result Envelope (`GET /v1/attempts/:id/result` and `POST /v1/attempts/:id/submit`)
Scorecard, section breakdowns, solutions, and rank qualification:
```json
{
  "attemptId": "att_1793816664",
  "testId": "cgl-mock-01",
  "testTitle": "SSC CGL Tier-I Full Length All-India Live Mock 01",
  "examTitle": "SSC CGL",
  "submittedAt": "2026-11-04T18:24:24.286Z",
  "totalScore": 47.5,
  "maxScore": 200,
  "overallAccuracy": 92.0,
  "totalTimeSpentSeconds": 1800,
  "totalQuestions": 100,
  "correctCount": 24,
  "wrongCount": 1,
  "unattemptedCount": 75,
  "percentile": null,
  "rank": null,
  "totalTestTakers": 1,
  "isSampleSufficientForRank": false,
  "rankNote": "Comparative rank will be officially computed once min sample size is reached.",
  "sections": [
    {
      "sectionTitle": "General Intelligence and Reasoning",
      "score": 47.5,
      "maxMarks": 50,
      "accuracy": 96.0
    }
  ]
}
```
