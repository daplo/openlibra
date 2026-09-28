# Community and business model

Product direction agreed: 2026-09-27. The Community/Business boundary below is the
accepted planning baseline. Features still need implementation; prices, final license
selection and contractual support commitments remain undecided.

## Agreed direction

Build a complete open-source design product with optional paid business services
and organization features. Community users will be able to create UI and vector
artwork, collaborate on a self-hosted server, review, prototype and export without
buying a license. Businesses may also use that Community edition.

Sell operational convenience and organizational control: managed hosting, reliable
backups, onboarding/support, centralized administration and governed delivery.
Do not make core drawing tools, ordinary collaboration or access to user files the
reason somebody must pay.

Start with Community and a managed Cloud offer. Validate Business demand with a few
teams before implementing a large enterprise feature set. Sponsors, training and
paid deployment assistance can fund early work without a billing platform.

## Agreed feature boundary

This is the delivery target; most shared features are not implemented yet.

| Capability              | Community: open source, self-hostable                                                                     | Paid value                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| UI/vector editor        | All core authoring, layout, text, tokens, components and illustration tools                               | No paid-only pen, boolean, layout or export tools                                                 |
| Files and portability   | Native files, standard exports, local recovery and dependency-complete project download                   | Managed storage capacity, backup operations and recovery assistance                               |
| Multiplayer             | Shared documents, cursors, reconnect, per-user undo and basic workspaces                                  | Operated infrastructure, capacity guarantees and service support                                  |
| Access and security     | Private self-hosted projects, basic roles/invites, secure authentication, personal MFA and security fixes | Organization-enforced identity/policy, directory provisioning and advanced administration         |
| Review/prototypes       | Comments, replies, resolution, basic assignment, revision links, prototype playback and manual approvals  | Required multi-stage approval policies, organization-wide review reporting and governance         |
| Versioning              | Snapshot/history mechanisms, named checkpoints, manual restore and version comparison                     | Managed history retention, automated backup schedules and administratively enforced retention     |
| Libraries               | Publish/version/reuse components and tokens on one's own installation                                     | Approved-library policies, organization-wide dependency reports and controlled rollout automation |
| Automation/integrations | Documented APIs, core import/export, webhooks and basic issue linking                                     | Maintained enterprise connectors, centrally managed credentials and hosted automation capacity    |
| Community ecosystem     | Templates, examples, extension interfaces, localization and contribution workflows                        | Optional commissioned assets, training and supported integrations                                 |
| Deployment              | Documented self-hosting, upgrade/migration tooling and manual backup/restore                              | Managed upgrades, dedicated deployments, migration assistance and contractual support             |

Community will have no commercial-use, editor-seat or project-count license
restriction. Real infrastructure limits still apply; administrators can configure
quotas. A free hosted plan, if offered, can have published resource limits because
free software does not imply unlimited free compute/storage.

Keep basic security and privacy in Community. Basic event logs and debug information
must remain available; paid audit features add durable organization-wide reporting,
export, retention policy and integration with external audit systems.

## Offers to validate

### Community

For individuals, education, open-source teams and organizations comfortable running
their own infrastructure. Includes the open editor and shared service foundations,
public documentation and community support. No vendor account or license-server
connection should be required to build or run it.

### Cloud

For teams that want the software operated for them. Charge for managed workspace
capacity, storage, hosting, backups and support. Private cloud projects can be paid
while private self-hosted projects remain available in Community.

Start with one simple offer and included resource allowances. Do not promise an
unlimited free hosted plan before measuring storage, bandwidth, rendering jobs and
support cost. Public sponsorship and education credits can be added deliberately.

### Business

For agencies and growing organizations with multiple teams or external clients.
Candidate differentiators, to validate before building:

- Client/project administration: guest access reviews, scheduled guest expiry,
  client-facing branding and a portfolio of review/delivery states.
- Design governance: approved library channels, upgrade campaigns, token/brand
  policy checks and reports showing affected documents before a change.
- Review governance: required reviewer groups, multi-stage sign-off, approval
  evidence and policy that invalidates sign-off when relevant content changes.
- Team operations: managed groups, onboarding/offboarding, ownership transfer and
  reports identifying inaccessible or ownerless projects.
- Identity/audit: enterprise SSO, SCIM provisioning, enforced authentication policy,
  durable audit exports and centrally managed integration credentials.

Manual approvals, basic guest roles, token validation and library versioning remain
Community capabilities. Business adds enforcement, automation and organization-wide
visibility. Bring high-demand administration work forward from M4 only after core
M2 access boundaries and M3 revision/review semantics are reliable.

### Enterprise and services

Later: dedicated deployments, customer-owned storage, regional hosting, custom
retention requirements, migration/upgrade assistance and negotiated service terms.
Sell only operational guarantees that the deployment and support team can deliver.

Enterprise does not imply that the product is already certified or compliant with
any named standard. Define evidence, responsibilities and actual capabilities first.

## Pricing experiments, not final prices

- Test a workspace subscription with included active editors and storage against a
  per-editor offer with included hosting. Keep reviewers/viewers free where feasible
  so feedback is not discouraged; apply abuse/resource limits explicitly.
- Offer supported self-hosted Business deployments through an organization-level
  subscription rather than requiring a hosted account for every local editor.
- Make cost limits visible: included storage, history retention, bandwidth/job
  allowances and what happens when a limit is reached. Avoid surprise overages.
- Validate willingness to pay with agencies, product teams and self-hosting teams
  using the actual collaboration/review workflow. Do not infer demand from feature votes.
- Track hosting cost per active workspace, storage growth, restore/support effort,
  activation, repeat collaboration and paid pilot retention. Collect operational
  metrics without recording document contents or private design text.

## License and commercial-code boundary

Current repository metadata declares `MIT` in root `Cargo.toml`; no root `LICENSE`
file was found in this audit. Complete the copyright/license inventory before
presenting the whole repository as consistently licensed.

Recommended near-term action: resolve and document the existing MIT intent before
accepting outside contributions. If maintaining shared improvements is strategically
important, evaluate MPL-2.0 as an alternative before changing the licensing policy.
Mozilla describes MPL as file-level copyleft that permits larger works containing
separately licensed code; distribution obligations still apply to covered files.
See the [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

AGPL is another option when network-service modifications should be shared with
users, but assess its interaction with planned extensions and contributor rights
before selecting it. The [GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedModsAGPL)
explains the network-source requirement for modified versions. A separate folder
or API is not by itself proof that every proposed license combination is valid.

If Business modules are proprietary, label them explicitly and keep licensing,
build dependencies and tests separate from Community. Call the product an open-source
Community edition with commercial extensions; do not describe proprietary modules
as open source. Alternatively, publish business features under an open-source
license and sell their operation/support. Decide this before soliciting contributions
to those modules; pricing alone does not decide whether software is open source.

Do not add a noncommercial or anti-competitor restriction to the Community license
while calling it open source. The [Open Source Definition](https://opensource.org/osd)
requires commercial use and fields of endeavor to remain permitted.

An ordinary file's artwork is not automatically licensed like the editor. Document
user ownership and handle bundled templates, fonts, icons and example artwork with
their own explicit licenses and attribution. Review existing dependency licenses
and rights to prior contributions before any relicensing; changing a manifest does
not rewrite permissions already granted for earlier releases.

## Community project work that is currently missing

- Contribution guide: reproducible setup, architecture overview, tests, review process
  and small labeled starter issues for code, docs, design, translations and accessibility.
- Maintainer governance: who decides scope, how RFCs work, how maintainers are added,
  how paid work is prioritized and how conflicts of interest are disclosed.
- Code of conduct, private security-reporting route, supported-version policy,
  coordinated vulnerability fixes and a documented release process.
- Contribution rights: select and publish a DCO/CLA policy deliberately. A DCO records
  provenance; it does not itself grant unrestricted future relicensing rights.
- Community design process: public usability discussions, accessibility reviews,
  shared design files and clear acceptance criteria for proposed features.
- Healthy maintenance: triage cadence, documented response expectations, release
  notes, maintainer handover and a transparent sponsorship/funding page.
- Distribution: versioned source/releases, reproducible build instructions, dependency
  notices, self-host deployment packages, migrations and a tested upgrade/rollback path.
- Localization: extract UI strings, establish translation review and verify non-English
  layouts, keyboard behavior and documentation rather than translating labels alone.

A public repository alone does not provide a sustainable contribution process.
Budget maintainer time for review, security, documentation and community support.

## Ecosystem and extensions

Start with curated example projects, reusable components and documented file/token
formats. Add searchable community templates and asset packs with provenance,
licenses, reporting/moderation and accessible previews after the core model settles.

Later, expose versioned extension APIs for commands, document read models,
import/export and panels. Require explicit permissions for network/file/document
access, isolate execution and support compatibility/deprecation rules. Community
must be able to build extensions without purchasing an SDK. Defer a paid marketplace
until distribution, moderation, update safety and maintainer demand are proven.

## Architecture and billing requirements

- Community builds and tests must succeed without private repositories, paid modules,
  entitlement checks, telemetry services or an online activation step.
- Put workspace billing, usage accounting and business entitlements in optional
  service boundaries. Server authorization remains mandatory regardless of plan.
- Model organization, workspace, membership, subscription and resource ownership
  separately; a billing contact is not automatically a document editor.
- Paid self-hosted modules need documented offline entitlement/grace behavior. A
  subscription check must never gate Community capabilities or corrupt documents.
- Test upgrades, downgrades, payment failure, trials, deletion, export and cancellation.
  Keep existing designs readable and exportable, with notice and a clear hosted-data
  retention/download period. Paid admin rules must fail predictably on expiry.
- Add billing only when a validated offer is ready: checkout, invoices, tax handling,
  idempotent signed webhook processing, subscription state, quotas and support tools.
- Define hosted privacy/terms, subprocessors, data deletion/export, incident response
  and restore procedures before storing customer projects. Do not claim certification
  or an SLA merely because a document or checkbox exists.

## Delivery alongside the design roadmap

| Stage | Community work                                                                    | Commercial work                                                                             | Evidence required                                                                     |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| M0    | License inventory, contribution/governance/security policies, reproducible builds | Publish agreed feature boundary and interview likely buyers                                 | Community build works independently; ownership/licensing gaps are recorded            |
| M1    | Public alpha, contributor onboarding, templates, localization foundation          | Test agency/team workflows and offer paid onboarding where useful                           | External contribution/review and repeat local design use                              |
| M2    | Complete self-hosted collaboration, basic roles, secure upgrades and recovery     | Small managed-cloud pilots; measure hosting/support cost                                    | Two-client correctness, access isolation and successful backup restore                |
| M3    | Stable community release, public APIs, review/prototypes and handoff              | Launch one validated paid offer; add billing and a small number of business differentiators | Paying pilot users, safe downgrade/export, tested support/deployment lifecycle        |
| M4    | Extension ecosystem and community-led expansion                                   | Enterprise identity/governance, dedicated hosting and negotiated guarantees                 | Demonstrated demand, delivery capacity and independently testable service commitments |

## Remaining decisions and validation

The Community promise is agreed: full authoring plus useful self-hosted collaboration.
The first commercial focus is managed private collaboration and client review for
small product teams and agencies. Customer demand still needs validation.

1. Resolve the existing MIT declaration and contribution policy; decide whether future
   Business code is open-source service value or explicitly commercial extensions.
2. Validate the initial customer segment and paid outcome through pilot teams before
   expanding the Business feature set.
3. Set actual cloud allowances/prices from pilot costs and demand; keep Enterprise
   commitments out of the first billing launch.

## External reference

Penpot provides a relevant example of an open-source design product with self-hosting
and paid enterprise offerings. Its [self-host pricing page](https://penpot.app/pricing/self-host)
is a market reference, not evidence that Open Libra should copy its prices or that
any particular business model is already validated for this project.
