# Wix Hybrid Content Access App — Technical Specification (v2)

## 1. Purpose
Develop a Wix App and backend service that enables a bot to access, normalize, and index website content for RAG usage using a **hybrid architecture**:
- Wix CMS & APIs (where permitted)
- HTML crawl of public pages (Wix and non-Wix)
- Full compliance with Wix ToS and third-party site ToS

---

## 2. Data Sources

### 2.1 Wix CMS (Primary Structured Source)
- Public CMS collections only
- Read-only access
- Language-aware
- Explicit mapping of collections → semantic sections

### 2.2 Wix Public Pages (HTML crawl)
- Only published, public pages
- No preview, editor, or authenticated routes
- Respect robots.txt
- Crawl frequency ≤ 1× per 24h per page

**Scope:** only the following two Wix sites:
1. https://www.fairyplace.biz/
2. https://fairyplaceua.wixsite.com/fairyplace

Rules:
- Each page is associated with the corresponding Site.id
- `Source` field = page
- Normalization, chunking, and embeddings per section

### 2.3 External Public Websites (HTML crawl)
Sources:
- https://www.spoonflower.com
- https://www.bagsoflove.com

Rules:
- HTTP GET only
- No authentication, cookies, or sessions
- Respect robots.txt and site ToS
- Crawl frequency ≤ 1× per 24h per page
- Allowed content:
  - informational pages
  - product specifications
  - help, docs, FAQ
- Disallowed content:
  - checkout, cart, account
  - pricing commitments, SLAs
  - user-generated content

Purpose:
- Reference information only
- Source URLs must be cited in bot answers

---

## 3. Permissions (Wix)
- Read Site URLs
- Read Media Manager
- Read Galleries
- Read FAQ
- Read Blog
- Read site & business metadata

Explicitly NOT required:
- Read Pages
- Read CMS private collections

---

## 4. Architecture Overview

### 4.1 Hybrid Ingestion Flow
1. Wix CMS ingest (if available)
2. HTML crawl (Wix + external)
3. Normalization into unified content model
4. Chunking into semantic sections
5. Embedding & vector indexing
6. RAG retrieval at query time

### 4.2 Source Priority
1. Wix CMS
2. Wix HTML pages (two sites only)
3. External sites

---

## 5. Data Model (Conceptual)

### 5.1 Site
- Represents a logical content source

Attributes:
- id
- name
- domain
- type: wix | external
- wix_site_id (nullable)
- wix_instance_id (nullable)
- primary_language

### 5.2 Page
- URL-scoped content unit

Attributes:
- id
- site_id
- url
- title
- source: cms | page
- fetched_at

Uniqueness:
- (site_id, url)

### 5.3 Section
- Smallest semantic unit

Attributes:
- id
- page_id
- content
- content_hash
- embedding
- source

Uniqueness:
- (page_id, content_hash)

### 5.4 Image
- Media references

Attributes:
- id
- page_id
- url
- alt_text
- source

---

## 6. Prisma Reference Schema (Appendix)

```prisma
enum SiteType {
  wix
  external
}

enum ContentSource {
  cms
  page
}

model Site {
  id              String   @id @default(cuid())
  name            String
  domain          String   @unique
  type            SiteType
  wixSiteId       String?
  wixInstanceId   String?
  primaryLanguage String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  pages           Page[]
}

model Page {
  id        String   @id @default(cuid())
  siteId    String
  url       String
  title     String?
  source    ContentSource
  fetchedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  site      Site     @relation(fields: [siteId], references: [id])
  sections  Section[]
  images    Image[]

  @@unique([siteId, url])
}

model Section {
  id          String   @id @default(cuid())
  pageId      String
  content     String
  contentHash String
  embedding   Bytes?
  source      ContentSource
  createdAt   DateTime @default(now())

  page        Page     @relation(fields: [pageId], references: [id])

  @@unique([pageId, contentHash])
}

model Image {
  id        String   @id @default(cuid())
  pageId    String
  url       String
  altText   String?
  source    ContentSource

  page      Page     @relation(fields: [pageId], references: [id])
}
```

---

## 7. Compliance & Legal
- No bypass of access controls
- No storage for redistribution
- No resale of third-party content
- Explicit source attribution in responses

---

## 8. Deliverables
- Wix App (read-only)
- Backend ingestion service
- Vector database integration
- Admin configuration for allowed domains
- Logging & crawl audit trail

---

## 9. Non-Goals
- User authentication
- Write access to Wix
- Real-time crawling
- Full site mirroring

---

## 10. Acceptance Criteria
- Bot answers cite correct source URLs
- External sites indexed without ToS violations
- CMS content preferred when available
- Identical content not duplicated across sources
