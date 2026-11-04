# SidPrep 2.0 — Administrative Workflows & RBAC Matrix

**Document Version:** 2.0.0  
**Governing Documents:** `01_Audit_And_Implementation_Blueprint.md` (Module 4) & `02_ANTIGRAVITY_MASTER_PROMPT.md` (Phase 3)

---

## 1. Role-Based Access Control (RBAC) Matrix

| Administrative Role | Overview Read | Question Bank | Bulk Import | Test Builder | News Ingest | News Approve | Resource Upload | Quota Dashboard | Team Admin |
|---|---|---|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | Read/Write | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Approve/Publish | Full CRUD | Full Access | Full Access |
| `CONTENT_MANAGER` | Read | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Approve/Publish | Full CRUD | Read | Forbidden |
| `EXAM_EDITOR` | Read | Author/Edit | Forbidden | Author/Edit | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |
| `CA_EDITOR` | Read | Forbidden | Forbidden | Forbidden | Ingest/Draft | Forbidden | Forbidden | Forbidden | Forbidden |
| `REVIEWER` | Read | Read | Forbidden | Read | Read | Approve/Publish | Read | Forbidden | Forbidden |
| `SUPPORT` | Read | Read | Forbidden | Read | Read | Forbidden | Read | Forbidden | Forbidden |
| `AUDITOR` | Read | Read | Forbidden | Read | Read | Forbidden | Read | Read | Read Only |

---

## 2. Server-Enforced Invariants

1. **Dual-Admin Verification Invariant (SEC-04):**
   - The creator of an official pattern change cannot approve their own proposal (`creatorId !== approverId`).
   - Self-approval attempts return HTTP `400 Bad Request` (`CANNOT_APPROVE_OWN_PATTERN`).
2. **Fail-Closed Administrative Gate:**
   - Every `/v1/admin/*` endpoint passes through `requireAdminAuth()`.
   - Anonymous requests return HTTP `401 Unauthorized`.
   - Inactive or suspended accounts return HTTP `403 Forbidden`.
3. **Immutable Audit Logging:**
   - Every administrative modification (question creation, bulk import, status transitions, permission updates, pattern verification) generates an immutable `AuditEventRecord` recording:
     `actorId`, `actorEmail`, `actorRole`, `module`, `action`, `targetId`, `changesDiff`, `ipAddress`, and `timestamp`.
4. **Content Provenance Requirements:**
   - No exam pattern or syllabus update can be tagged as "Verified" without a specific official source URL (`sourceUrl`) and issuing authority verification date (`verifiedDate`). Generic homepage URLs are rejected as proof.
