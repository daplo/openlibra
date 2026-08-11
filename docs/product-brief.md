# Product brief

## Working name

Open Libra

## Vision

Open Libra is a browser-based environment where product designers, developers, and product teams work on the same product definition through different modes. These modes share one document and one engine, but expose tools and information appropriate to each job.

The long-term goal is to shorten the feedback loop between interface design, design systems, implementation, and review.

## Target users

- Professional product designers creating web and mobile applications
- Developers translating designs into production code
- Product teams reviewing work and giving feedback

## Product principles

1. One source of truth, multiple modes. Modes change the workflow, not the underlying artifact.
2. Components and tokens are first-class data, not conventions layered on top of drawings.
3. Collaboration is part of the document architecture from the beginning.
4. Design libraries can exist, evolve, and be published independently of design documents.
5. The first prototype favors a coherent vertical slice over broad feature coverage.

## Product modes

### Design mode

Create application screens using frames, tokens, layouts, constraints, layers, groups, and transforms.

### Developer mode

Inspect dimensions, spacing, layout behavior, constraints, tokens, CSS-like values, and exportable assets. A later version will map design components and variants to real code components and typed props.

### Review mode

Navigate designs, observe presence, leave comments, and participate in feedback without exposing the full editing interface.

Mode names and exact boundaries remain hypotheses to validate during prototyping.

## First prototype scope

### Included

- Cloud-hosted user documents
- Multiple pages per document
- Infinite canvas rendered in the browser
- Frames for web and mobile screens
- Design tokens
- Stack/flex-style layouts
- Responsive constraints
- Layer tree and grouping
- Selection, move, resize, and basic transforms
- Command-based undo and redo
- Comments attached to canvas positions or objects
- Multiplayer presence and cursors
- Developer inspection of CSS-like layout and token values
- Approximately 1,000 simultaneously visible objects on a typical laptop

### Designed for, but not necessarily complete

- A document asset vault containing images, local components, and reusable resources
- Export definitions with format, scale, density, theme, platform, and state variations
- Separately published, versioned component libraries
- Stable component identities for future mapping to code

### Not in the first prototype

- Figma file compatibility
- Full vector pen tooling or illustration workflows
- Interactive prototyping
- Complete asset processing and export matrix
- Offline-first synchronization
- Production-grade permissions, billing, or organization administration
- Code-component linking or code generation
- Safari, Firefox, tablet, or WebGL compatibility guarantees
- Documents substantially beyond the initial 1,000-visible-object target

## Prototype success criteria

A solo user can create a cloud document, add pages, compose a small responsive application screen from token-driven frames and layouts, reorganize and transform layers, undo edits, and inspect implementation-oriented values. Opening the same document in a second browser session shows live edits and cursors, and a reviewer can attach a comment to an object.

Canvas interactions should feel immediate. The working target is 60 frames per second during pan, zoom, selection, and simple transforms with roughly 1,000 visible objects on the reference development laptop.

## Open product questions

- Should tokens and components be owned by a document, workspace vault, library, or all three through explicit promotion?
- What publishing and update workflow should govern component libraries?
- Which layout semantics should deliberately match CSS, and where should the design model diverge?
- Are designer, developer, and review modes fixed roles or user-selectable workspaces independent of permissions?
- What is the smallest useful asset-variation model?
