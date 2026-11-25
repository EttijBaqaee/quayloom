# License, credits and references

## Quayloom original work

Quayloom's own code and modifications are licensed under GNU Affero General Public License version 3 only (`AGPL-3.0-only`), unless a file explicitly states otherwise. The complete, unmodified license text is in [LICENSE](LICENSE). This program is provided without warranty, subject to the terms of that license. Recipients may copy, modify and redistribute it under the applicable license conditions.

This project-level license does not replace third-party copyright notices or relicense third-party material. Components retained under their original licenses remain available under those terms. Distribution of the combined work must satisfy the applicable obligations of all included components.

## Upstream chat interface

Quayloom adapts the React chat interface from [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo), upstream package version 0.1.3. The upstream MIT notice, including `Copyright (c) 2026 DeepSeek`, is preserved verbatim in [LICENSES/MIT-chat-demo.txt](LICENSES/MIT-chat-demo.txt). No ownership of that upstream work is claimed.

Dependencies, embedded fonts and other third-party assets retain their respective copyright and license terms. The [third-party component inventory](LICENSES/THIRD-PARTY.md) and [machine-readable version/license inventory](LICENSES/THIRD-PARTY.json) identify the installed production dependency closure, with each component's original license/NOTICE text, package metadata and additional copyright headers retained under `LICENSES/third-party/`. This is a conservative inventory that also includes available peer/optional dependencies and declared type packages, not a claim that every package is emitted into the browser bundle. Original third-party license terms are not replaced by AGPL.

KaTeX's JavaScript/software is MIT, but the bundled font metadata specifies **SIL OFL 1.1**, Design Science/Khan Academy copyrights and Reserved Font Names. The [original embedded font notices](LICENSES/KaTeX-fonts-NOTICES.json) and [complete OFL 1.1 text](LICENSES/OFL-1.1.txt) are retained separately. DOMPurify offers MPL-2.0 OR Apache-2.0; this distribution uses its Apache-2.0 option and preserves both original license texts and source license headers. The inventory documents the micromark subpackages whose packages omit a standalone license and preserves their original readme attribution plus the same upstream monorepo's installed MIT text. Distributors must retain and update these notices for the exact dependency versions they convey; the manifest and lockfile are not substitutes for license texts.

New product branding uses an original geometric harbor/dialogue symbol; no DeepSeek whale graphic is included. Quayloom is independent and does not claim affiliation with DeepSeek or DSH, or trademark authorization. Naming is not a claim of trademark clearance or exclusive rights.

## Conceptual references

DSH was inspected for the conceptual provider → endpoint/authentication → model/capability configuration pattern. This application is independent and does not load DSH credentials, account tokens, profiles or plugins. It implements a narrower protocol set than DSH.

Pictelier was inspected for provider profiles and quota reservation/settlement concepts at commit `cedd705aa028815ea7da00c3540a9f8183c7cd8a`:

- https://github.com/EttijBaqaee/pictelier/tree/cedd705aa028815ea7da00c3540a9f8183c7cd8a
- https://github.com/EttijBaqaee/pictelier/blob/cedd705aa028815ea7da00c3540a9f8183c7cd8a/LICENSE

That reference is AGPL-3.0-only. No Pictelier source was copied into this project. Quayloom's SQLite chat request/token ledger was independently implemented; Pictelier image/video quota and selected vendor balance snapshots are not represented as chat-token billing or an implemented feature here.

The usage-code enhancement also inspected Pictelier commit `0477e08e8328652cfdfaf66c463970e626a9ff69` for administrator-visible codes, allowed channels and independent provider-specific quota accounting:

- https://github.com/EttijBaqaee/pictelier/blob/0477e08e8328652cfdfaf66c463970e626a9ff69/server/src/lib/db.ts#L2139-L2206
- https://github.com/EttijBaqaee/pictelier/blob/0477e08e8328652cfdfaf66c463970e626a9ff69/src/lib/providerUnusedUsageCodes.ts

No source from that enhancement reference was copied. Quayloom uses its own encrypted-code store and code × channel chat request/token ledger. Quayloom's choice of AGPL-3.0-only for its own work is not a claim of ownership over those references.

The Android 0.2.0 and mobile chat redesign uses DeepSeek's [official download page](https://download.deepseek.com/) and its [2025 app announcement](https://api-docs.deepseek.com/news/news250115/) as visual hierarchy references only. The announcement images are historical promotional screenshots, not independently captured Android 2.9.0 device screenshots. No APK code, brand artwork or extracted assets are incorporated. Quayloom's native login, navigation and network safeguards are independently implemented.

## Corresponding Source

Release operators must provide the Corresponding Source for the version conveyed or offered for remote interaction as required by the AGPL. Quayloom's release mechanism provides a source ZIP through the web interface and `GET /api/source.zip` under the configured base path; Docker and APK distributions also include the matching source archive. A public GitHub repository is not required for this mechanism.

The source must include the material needed to modify, build, install and run the covered work, with applicable license notices and installation instructions. Production credentials, user data and private signing keys must not be published; Android source can be built and signed using the recipient's own key. Release operators must check that these source delivery paths are available and match the actual distributed/running version before release. This notice does not assert that any particular deployment or device test has already completed.
