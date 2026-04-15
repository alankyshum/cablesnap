# Architecture Decisions

### Product Pivots Cascade Through Data Models
**Source**: BLD-27 — Strategic Pivot to Cable Machine Focus + Beyond Power Voltra
**Date**: 2026-04-15
**Context**: FitForge pivoted from general barbell focus to cable-machine-specific (Voltra device) training. The pivot required restructuring the entire exercise data model to support 7 training modes (eccentric overload, chains, isokinetic), mount positions, and attachment types — not just adding new exercises.
**Learning**: A product strategy pivot does not just change feature priorities — it cascades through the data model. New device capabilities (training modes, equipment metadata) must be reflected in database schema and seed data before any feature work begins. Building features on an un-restructured data model leads to rework.
**Action**: When executing a product pivot, first audit the existing data model against the new domain requirements. Restructure schema and seed data to reflect the new domain BEFORE starting feature implementation. Document the new domain entities and their relationships as the first deliverable of the pivot.
**Tags**: architecture, product-pivot, data-model, domain-modeling, schema-design, cross-project
