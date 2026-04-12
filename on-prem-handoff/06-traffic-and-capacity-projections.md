# Traffic and Capacity Projections (1–5 Years)

## Brief description

This section combines **documented pilot assumptions** with a **framework** for 1–5 year planning. **Business-approved user counts and transaction growth must be validated** — the stakeholder email explicitly calls for input from **Daniel Abiero** to firm up projections. Replace placeholder tables below after workshop with finance/operations.

## Baseline from current project documentation (pilot)


| Metric                                | Documented pilot target                                        | Source / note                                                             |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Concurrent users**                  | ~**700**                                                       | `SYSTEM_DESCRIPTION_FOR_CLOUD_ENGINEERS.txt`, `AWS_PILOT_REQUIREMENTS.md` |
| **Registered users (implied)**        | Not fixed in repo                                              | Derive from org employee + contractor roster                              |
| **Peak usage pattern**                | Business hours (e.g. 8:00–18:00) local to Ghana/Liberia        | System description                                                        |
| **API latency target (p95)**          | **< 1 s** general API; AI routes slower (**2–5+ s**)           | System description                                                        |
| **Concurrent DB connections**         | ~**150**                                                       | System description                                                        |
| **Egress / static traffic (example)** | ~**100 GB/month** frontend/CDN for 700 users (cloud pilot doc) | Order-of-magnitude only                                                   |
| **Email volume (example)**            | ~**2,000 emails/month**                                        | System description                                                        |


## Illustrative 5-year projection table (requires sign-off)

**Status: PLACEHOLDER — confirm with Daniel Abiero and business stakeholders.**

The ratios below assume modest linear growth from a pilot; real fleets may step-change when new countries or business units onboard.


| Year  | Scenario label                   | Approx. registered users                       | Approx. peak concurrent                                     | Notes                                |
| ----- | -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| **1** | Pilot / early production         | *TBD — e.g. 500–2,000*                         | ~**700** (documented)                                       | Align with GTI pilot completion      |
| **2** | Expansion                        | *TBD*                                          | *TBD*                                                       | Add buffer for reporting peaks       |
| **3** | Multi-site / multi-country scale | *TBD — email example: 10,000 users in 3 years* | *TBD (~10–15% of registered for concurrent, rule of thumb)* | Validate against license count       |
| **4** | Mature operations                | *TBD*                                          | *TBD*                                                       | Plan read replicas / split read load |
| **5** | Steady state + analytics         | *TBD*                                          | *TBD*                                                       | Higher read share for dashboards     |


## Transaction-oriented capacity (framework)

Fleet systems scale with **operational events**, not only user count:

- **Writes:** fuel logs, maintenance jobs, expenditures, incidents, inventory movements, document uploads  
- **Reads:** dashboards, lists, reports, exports

**Suggested planning metrics to collect with Daniel / operations:**

1. Vehicles under management (per country) by year
2. Average fuel entries per vehicle per month
3. Maintenance work orders per month
4. Document uploads per month (count + average size)
5. Report generation frequency (batch vs interactive)

From those, infrastructure can estimate:

- API requests/sec peak and daily totals  
- DB read/write IOPS and storage growth (see [05-database-architecture-and-sizing.md](05-database-architecture-and-sizing.md))  
- Object storage growth (GB/month)

## Load and saturation indicators

- **API tier:** CPU on Uvicorn workers, p95 latency, error rate  
- **DB:** connection pool use, slow queries, disk IOPS  
- **AI routes:** dependency on external API quotas and latency

## Action items

1. **Daniel Abiero:** Provide approved **user growth**, **fleet size**, and **transaction** assumptions by year.
2. **Infrastructure:** Run **load tests** against on-prem or staging with JWT-authenticated scenarios mirroring top pages.
3. **Joint review:** Update this document with **signed-off numbers** and link to test reports after RPO/RTO alignment.

