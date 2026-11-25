# Third-party component licenses

This release inventory covers 218 installed package versions reachable from production dependency declarations, conservatively including available peers and optional packages. Types declared in production dependencies are included; development-only roots are not traversed. No dependency source tree is copied here.

Original license/NOTICE files are byte-for-byte copies. Component metadata retains package identity, version and author information. COPYRIGHT-HEADERS excerpts retain additional source notices; excerpts do not replace full licenses. The machine-readable inventory records original paths and SHA-256 values. All listed versions were checked against the project lockfile.

- [Machine-readable inventory](THIRD-PARTY.json)
- [Upstream chat-demo MIT notice](MIT-chat-demo.txt)
- [KaTeX font copyrights, reserved names and embedded license records](KaTeX-fonts-NOTICES.json)
- [SIL OFL 1.1 full official text](OFL-1.1.txt)

KaTeX software is MIT; its bundled fonts have separate OFL-1.1 notices. The font notices retain Copyright (c) 2009-2010 Design Science, Inc., Copyright (c) 2014-2018 Khan Academy, and every Reserved Font Name. Do not relicense the fonts as MIT or AGPL.

The complete OFL text is transcribed from https://openfontlicense.org/documents/OFL.txt (also published at https://openfontlicense.org/open-font-license-official-text/). Official template header placeholders are supplemented by the exact component-specific embedded statements in the font notices.

DOMPurify offers MPL-2.0 OR Apache-2.0; this distribution uses its Apache-2.0 option, preserving both original license texts and its source license header. Other Apache-2.0 component notices remain intact.

Fifteen micromark subpackages omit a standalone license in their installed distribution. Each original readme identifies MIT, Titus Wormer and the shared micromark repository license; each entry preserves that readme and the installed micromark MIT text, with provenance recorded in the inventory. khroma omits its manifest license field; its original MIT license is retained.

The optional peer immer is not installed and is not included as a distributed component. New dependencies or changed versions require updating and reviewing this inventory. External tools/platform runtime components (Node.js, Android System WebView/SDK and base OS images) retain their own distribution notices; this npm inventory does not replace those platform notices.

| Component | Version | Declared / evidenced license | Original notices |
| --- | --- | --- | --- |
| @antfu/install-pkg | 1.1.0 | MIT | [LICENSE](third-party/antfu__install-pkg@1.1.0/original/LICENSE) · [metadata](third-party/antfu__install-pkg@1.1.0/metadata.json) |
| @antfu/utils | 8.1.1 | MIT | [LICENSE](third-party/antfu__utils@8.1.1/original/LICENSE) · [metadata](third-party/antfu__utils@8.1.1/metadata.json) |
| @braintree/sanitize-url | 7.1.2 | MIT | [LICENSE](third-party/braintree__sanitize-url@7.1.2/original/LICENSE) · [metadata](third-party/braintree__sanitize-url@7.1.2/metadata.json) |
| @chevrotain/cst-dts-gen | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain__cst-dts-gen@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain__cst-dts-gen@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain__cst-dts-gen@11.0.3/metadata.json) |
| @chevrotain/gast | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain__gast@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain__gast@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain__gast@11.0.3/metadata.json) |
| @chevrotain/regexp-to-ast | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain__regexp-to-ast@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain__regexp-to-ast@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain__regexp-to-ast@11.0.3/metadata.json) |
| @chevrotain/types | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain__types@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain__types@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain__types@11.0.3/metadata.json) |
| @chevrotain/utils | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain__utils@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain__utils@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain__utils@11.0.3/metadata.json) |
| @iconify/types | 2.0.0 | MIT | [license.txt](third-party/iconify__types@2.0.0/original/license.txt) · [copyright headers](third-party/iconify__types@2.0.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/iconify__types@2.0.0/metadata.json) |
| @iconify/utils | 2.3.0 | MIT | [license.txt](third-party/iconify__utils@2.3.0/original/license.txt) · [copyright headers](third-party/iconify__utils@2.3.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/iconify__utils@2.3.0/metadata.json) |
| @mermaid-js/parser | 0.6.3 | MIT | [LICENSE](third-party/mermaid-js__parser@0.6.3/original/LICENSE) · [metadata](third-party/mermaid-js__parser@0.6.3/metadata.json) |
| @types/d3 | 7.4.3 | MIT | [LICENSE](third-party/types__d3@7.4.3/original/LICENSE) · [metadata](third-party/types__d3@7.4.3/metadata.json) |
| @types/d3-array | 3.2.2 | MIT | [LICENSE](third-party/types__d3-array@3.2.2/original/LICENSE) · [metadata](third-party/types__d3-array@3.2.2/metadata.json) |
| @types/d3-axis | 3.0.6 | MIT | [LICENSE](third-party/types__d3-axis@3.0.6/original/LICENSE) · [metadata](third-party/types__d3-axis@3.0.6/metadata.json) |
| @types/d3-brush | 3.0.6 | MIT | [LICENSE](third-party/types__d3-brush@3.0.6/original/LICENSE) · [metadata](third-party/types__d3-brush@3.0.6/metadata.json) |
| @types/d3-chord | 3.0.6 | MIT | [LICENSE](third-party/types__d3-chord@3.0.6/original/LICENSE) · [metadata](third-party/types__d3-chord@3.0.6/metadata.json) |
| @types/d3-color | 3.1.3 | MIT | [LICENSE](third-party/types__d3-color@3.1.3/original/LICENSE) · [metadata](third-party/types__d3-color@3.1.3/metadata.json) |
| @types/d3-contour | 3.0.6 | MIT | [LICENSE](third-party/types__d3-contour@3.0.6/original/LICENSE) · [metadata](third-party/types__d3-contour@3.0.6/metadata.json) |
| @types/d3-delaunay | 6.0.4 | MIT | [LICENSE](third-party/types__d3-delaunay@6.0.4/original/LICENSE) · [metadata](third-party/types__d3-delaunay@6.0.4/metadata.json) |
| @types/d3-dispatch | 3.0.7 | MIT | [LICENSE](third-party/types__d3-dispatch@3.0.7/original/LICENSE) · [metadata](third-party/types__d3-dispatch@3.0.7/metadata.json) |
| @types/d3-drag | 3.0.7 | MIT | [LICENSE](third-party/types__d3-drag@3.0.7/original/LICENSE) · [metadata](third-party/types__d3-drag@3.0.7/metadata.json) |
| @types/d3-dsv | 3.0.7 | MIT | [LICENSE](third-party/types__d3-dsv@3.0.7/original/LICENSE) · [metadata](third-party/types__d3-dsv@3.0.7/metadata.json) |
| @types/d3-ease | 3.0.2 | MIT | [LICENSE](third-party/types__d3-ease@3.0.2/original/LICENSE) · [metadata](third-party/types__d3-ease@3.0.2/metadata.json) |
| @types/d3-fetch | 3.0.7 | MIT | [LICENSE](third-party/types__d3-fetch@3.0.7/original/LICENSE) · [metadata](third-party/types__d3-fetch@3.0.7/metadata.json) |
| @types/d3-force | 3.0.10 | MIT | [LICENSE](third-party/types__d3-force@3.0.10/original/LICENSE) · [metadata](third-party/types__d3-force@3.0.10/metadata.json) |
| @types/d3-format | 3.0.4 | MIT | [LICENSE](third-party/types__d3-format@3.0.4/original/LICENSE) · [metadata](third-party/types__d3-format@3.0.4/metadata.json) |
| @types/d3-geo | 3.1.1 | MIT | [LICENSE](third-party/types__d3-geo@3.1.1/original/LICENSE) · [metadata](third-party/types__d3-geo@3.1.1/metadata.json) |
| @types/d3-hierarchy | 3.1.7 | MIT | [LICENSE](third-party/types__d3-hierarchy@3.1.7/original/LICENSE) · [metadata](third-party/types__d3-hierarchy@3.1.7/metadata.json) |
| @types/d3-interpolate | 3.0.4 | MIT | [LICENSE](third-party/types__d3-interpolate@3.0.4/original/LICENSE) · [metadata](third-party/types__d3-interpolate@3.0.4/metadata.json) |
| @types/d3-path | 3.1.1 | MIT | [LICENSE](third-party/types__d3-path@3.1.1/original/LICENSE) · [metadata](third-party/types__d3-path@3.1.1/metadata.json) |
| @types/d3-polygon | 3.0.2 | MIT | [LICENSE](third-party/types__d3-polygon@3.0.2/original/LICENSE) · [metadata](third-party/types__d3-polygon@3.0.2/metadata.json) |
| @types/d3-quadtree | 3.0.6 | MIT | [LICENSE](third-party/types__d3-quadtree@3.0.6/original/LICENSE) · [metadata](third-party/types__d3-quadtree@3.0.6/metadata.json) |
| @types/d3-random | 3.0.4 | MIT | [LICENSE](third-party/types__d3-random@3.0.4/original/LICENSE) · [metadata](third-party/types__d3-random@3.0.4/metadata.json) |
| @types/d3-scale | 4.0.9 | MIT | [LICENSE](third-party/types__d3-scale@4.0.9/original/LICENSE) · [metadata](third-party/types__d3-scale@4.0.9/metadata.json) |
| @types/d3-scale-chromatic | 3.1.0 | MIT | [LICENSE](third-party/types__d3-scale-chromatic@3.1.0/original/LICENSE) · [metadata](third-party/types__d3-scale-chromatic@3.1.0/metadata.json) |
| @types/d3-selection | 3.0.12 | MIT | [LICENSE](third-party/types__d3-selection@3.0.12/original/LICENSE) · [metadata](third-party/types__d3-selection@3.0.12/metadata.json) |
| @types/d3-shape | 3.2.0 | MIT | [LICENSE](third-party/types__d3-shape@3.2.0/original/LICENSE) · [metadata](third-party/types__d3-shape@3.2.0/metadata.json) |
| @types/d3-time | 3.0.4 | MIT | [LICENSE](third-party/types__d3-time@3.0.4/original/LICENSE) · [metadata](third-party/types__d3-time@3.0.4/metadata.json) |
| @types/d3-time-format | 4.0.3 | MIT | [LICENSE](third-party/types__d3-time-format@4.0.3/original/LICENSE) · [metadata](third-party/types__d3-time-format@4.0.3/metadata.json) |
| @types/d3-timer | 3.0.2 | MIT | [LICENSE](third-party/types__d3-timer@3.0.2/original/LICENSE) · [metadata](third-party/types__d3-timer@3.0.2/metadata.json) |
| @types/d3-transition | 3.0.9 | MIT | [LICENSE](third-party/types__d3-transition@3.0.9/original/LICENSE) · [metadata](third-party/types__d3-transition@3.0.9/metadata.json) |
| @types/d3-zoom | 3.0.9 | MIT | [LICENSE](third-party/types__d3-zoom@3.0.9/original/LICENSE) · [metadata](third-party/types__d3-zoom@3.0.9/metadata.json) |
| @types/debug | 4.1.13 | MIT | [LICENSE](third-party/types__debug@4.1.13/original/LICENSE) · [metadata](third-party/types__debug@4.1.13/metadata.json) |
| @types/geojson | 7946.0.16 | MIT | [LICENSE](third-party/types__geojson@7946.0.16/original/LICENSE) · [metadata](third-party/types__geojson@7946.0.16/metadata.json) |
| @types/hast | 3.0.5 | MIT | [LICENSE](third-party/types__hast@3.0.5/original/LICENSE) · [metadata](third-party/types__hast@3.0.5/metadata.json) |
| @types/katex | 0.16.8 | MIT | [LICENSE](third-party/types__katex@0.16.8/original/LICENSE) · [metadata](third-party/types__katex@0.16.8/metadata.json) |
| @types/mdast | 4.0.4 | MIT | [LICENSE](third-party/types__mdast@4.0.4/original/LICENSE) · [metadata](third-party/types__mdast@4.0.4/metadata.json) |
| @types/ms | 2.1.0 | MIT | [LICENSE](third-party/types__ms@2.1.0/original/LICENSE) · [metadata](third-party/types__ms@2.1.0/metadata.json) |
| @types/prismjs | 1.26.6 | MIT | [LICENSE](third-party/types__prismjs@1.26.6/original/LICENSE) · [metadata](third-party/types__prismjs@1.26.6/metadata.json) |
| @types/prop-types | 15.7.15 | MIT | [LICENSE](third-party/types__prop-types@15.7.15/original/LICENSE) · [metadata](third-party/types__prop-types@15.7.15/metadata.json) |
| @types/react | 18.3.31 | MIT | [LICENSE](third-party/types__react@18.3.31/original/LICENSE) · [metadata](third-party/types__react@18.3.31/metadata.json) |
| @types/react-dom | 18.3.0 | MIT | [LICENSE](third-party/types__react-dom@18.3.0/original/LICENSE) · [metadata](third-party/types__react-dom@18.3.0/metadata.json) |
| @types/trusted-types | 2.0.7 | MIT | [LICENSE](third-party/types__trusted-types@2.0.7/original/LICENSE) · [metadata](third-party/types__trusted-types@2.0.7/metadata.json) |
| @types/unist | 3.0.3 | MIT | [LICENSE](third-party/types__unist@3.0.3/original/LICENSE) · [metadata](third-party/types__unist@3.0.3/metadata.json) |
| acorn | 8.19.0 | MIT | [LICENSE](third-party/acorn@8.19.0/original/LICENSE) · [metadata](third-party/acorn@8.19.0/metadata.json) |
| ccount | 2.0.1 | MIT | [license](third-party/ccount@2.0.1/original/license) · [metadata](third-party/ccount@2.0.1/metadata.json) |
| character-entities | 2.0.2 | MIT | [license](third-party/character-entities@2.0.2/original/license) · [metadata](third-party/character-entities@2.0.2/metadata.json) |
| chevrotain | 11.0.3 | Apache-2.0 | [LICENSE.txt](third-party/chevrotain@11.0.3/original/LICENSE.txt) · [copyright headers](third-party/chevrotain@11.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain@11.0.3/metadata.json) |
| chevrotain-allstar | 0.3.1 | MIT | [LICENSE](third-party/chevrotain-allstar@0.3.1/original/LICENSE) · [copyright headers](third-party/chevrotain-allstar@0.3.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/chevrotain-allstar@0.3.1/metadata.json) |
| clsx | 2.1.1 | MIT | [license](third-party/clsx@2.1.1/original/license) · [metadata](third-party/clsx@2.1.1/metadata.json) |
| commander | 7.2.0 | MIT | [LICENSE](third-party/commander@7.2.0/original/LICENSE) · [metadata](third-party/commander@7.2.0/metadata.json) |
| commander | 8.3.0 | MIT | [LICENSE](third-party/commander@8.3.0/original/LICENSE) · [metadata](third-party/commander@8.3.0/metadata.json) |
| confbox | 0.1.8 | MIT | [LICENSE](third-party/confbox@0.1.8/original/LICENSE) · [copyright headers](third-party/confbox@0.1.8/COPYRIGHT-HEADERS.txt) · [metadata](third-party/confbox@0.1.8/metadata.json) |
| confbox | 0.3.2 | MIT | [LICENSE](third-party/confbox@0.3.2/original/LICENSE) · [metadata](third-party/confbox@0.3.2/metadata.json) |
| cose-base | 1.0.3 | MIT | [LICENSE](third-party/cose-base@1.0.3/original/LICENSE) · [metadata](third-party/cose-base@1.0.3/metadata.json) |
| cose-base | 2.2.0 | MIT | [LICENSE](third-party/cose-base@2.2.0/original/LICENSE) · [metadata](third-party/cose-base@2.2.0/metadata.json) |
| csstype | 3.2.3 | MIT | [LICENSE](third-party/csstype@3.2.3/original/LICENSE) · [metadata](third-party/csstype@3.2.3/metadata.json) |
| cytoscape | 3.34.4 | MIT | [LICENSE](third-party/cytoscape@3.34.4/original/LICENSE) · [license-update.mjs](third-party/cytoscape@3.34.4/original/license-update.mjs) · [copyright headers](third-party/cytoscape@3.34.4/COPYRIGHT-HEADERS.txt) · [metadata](third-party/cytoscape@3.34.4/metadata.json) |
| cytoscape-cose-bilkent | 4.1.0 | MIT | [LICENSE](third-party/cytoscape-cose-bilkent@4.1.0/original/LICENSE) · [metadata](third-party/cytoscape-cose-bilkent@4.1.0/metadata.json) |
| cytoscape-fcose | 2.2.0 | MIT | [LICENSE](third-party/cytoscape-fcose@2.2.0/original/LICENSE) · [metadata](third-party/cytoscape-fcose@2.2.0/metadata.json) |
| d3 | 7.9.2 | ISC | [LICENSE](third-party/d3@7.9.2/original/LICENSE) · [copyright headers](third-party/d3@7.9.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3@7.9.2/metadata.json) |
| d3-array | 2.12.1 | BSD-3-Clause | [LICENSE](third-party/d3-array@2.12.1/original/LICENSE) · [copyright headers](third-party/d3-array@2.12.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-array@2.12.1/metadata.json) |
| d3-array | 3.2.5 | ISC | [LICENSE](third-party/d3-array@3.2.5/original/LICENSE) · [copyright headers](third-party/d3-array@3.2.5/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-array@3.2.5/metadata.json) |
| d3-axis | 3.0.1 | ISC | [LICENSE](third-party/d3-axis@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-axis@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-axis@3.0.1/metadata.json) |
| d3-brush | 3.0.1 | ISC | [LICENSE](third-party/d3-brush@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-brush@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-brush@3.0.1/metadata.json) |
| d3-chord | 3.0.2 | ISC | [LICENSE](third-party/d3-chord@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-chord@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-chord@3.0.2/metadata.json) |
| d3-color | 3.1.1 | ISC | [LICENSE](third-party/d3-color@3.1.1/original/LICENSE) · [copyright headers](third-party/d3-color@3.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-color@3.1.1/metadata.json) |
| d3-contour | 4.0.3 | ISC | [LICENSE](third-party/d3-contour@4.0.3/original/LICENSE) · [copyright headers](third-party/d3-contour@4.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-contour@4.0.3/metadata.json) |
| d3-delaunay | 6.0.6 | ISC | [LICENSE](third-party/d3-delaunay@6.0.6/original/LICENSE) · [copyright headers](third-party/d3-delaunay@6.0.6/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-delaunay@6.0.6/metadata.json) |
| d3-dispatch | 3.0.2 | ISC | [LICENSE](third-party/d3-dispatch@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-dispatch@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-dispatch@3.0.2/metadata.json) |
| d3-drag | 3.0.1 | ISC | [LICENSE](third-party/d3-drag@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-drag@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-drag@3.0.1/metadata.json) |
| d3-dsv | 3.0.2 | ISC | [LICENSE](third-party/d3-dsv@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-dsv@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-dsv@3.0.2/metadata.json) |
| d3-ease | 3.0.2 | BSD-3-Clause | [LICENSE](third-party/d3-ease@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-ease@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-ease@3.0.2/metadata.json) |
| d3-fetch | 3.0.2 | ISC | [LICENSE](third-party/d3-fetch@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-fetch@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-fetch@3.0.2/metadata.json) |
| d3-force | 3.0.1 | ISC | [LICENSE](third-party/d3-force@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-force@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-force@3.0.1/metadata.json) |
| d3-format | 3.1.3 | ISC | [LICENSE](third-party/d3-format@3.1.3/original/LICENSE) · [copyright headers](third-party/d3-format@3.1.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-format@3.1.3/metadata.json) |
| d3-geo | 3.1.2 | ISC | [LICENSE](third-party/d3-geo@3.1.2/original/LICENSE) · [copyright headers](third-party/d3-geo@3.1.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-geo@3.1.2/metadata.json) |
| d3-hierarchy | 3.1.3 | ISC | [LICENSE](third-party/d3-hierarchy@3.1.3/original/LICENSE) · [copyright headers](third-party/d3-hierarchy@3.1.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-hierarchy@3.1.3/metadata.json) |
| d3-interpolate | 3.0.2 | ISC | [LICENSE](third-party/d3-interpolate@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-interpolate@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-interpolate@3.0.2/metadata.json) |
| d3-path | 1.0.9 | BSD-3-Clause | [LICENSE](third-party/d3-path@1.0.9/original/LICENSE) · [copyright headers](third-party/d3-path@1.0.9/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-path@1.0.9/metadata.json) |
| d3-path | 3.1.1 | ISC | [LICENSE](third-party/d3-path@3.1.1/original/LICENSE) · [copyright headers](third-party/d3-path@3.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-path@3.1.1/metadata.json) |
| d3-polygon | 3.0.2 | ISC | [LICENSE](third-party/d3-polygon@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-polygon@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-polygon@3.0.2/metadata.json) |
| d3-quadtree | 3.0.2 | ISC | [LICENSE](third-party/d3-quadtree@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-quadtree@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-quadtree@3.0.2/metadata.json) |
| d3-random | 3.0.2 | ISC | [LICENSE](third-party/d3-random@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-random@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-random@3.0.2/metadata.json) |
| d3-sankey | 0.12.3 | BSD-3-Clause | [LICENSE](third-party/d3-sankey@0.12.3/original/LICENSE) · [copyright headers](third-party/d3-sankey@0.12.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-sankey@0.12.3/metadata.json) |
| d3-scale | 4.0.3 | ISC | [LICENSE](third-party/d3-scale@4.0.3/original/LICENSE) · [copyright headers](third-party/d3-scale@4.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-scale@4.0.3/metadata.json) |
| d3-scale-chromatic | 3.1.1 | ISC | [LICENSE](third-party/d3-scale-chromatic@3.1.1/original/LICENSE) · [copyright headers](third-party/d3-scale-chromatic@3.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-scale-chromatic@3.1.1/metadata.json) |
| d3-selection | 3.0.1 | ISC | [LICENSE](third-party/d3-selection@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-selection@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-selection@3.0.1/metadata.json) |
| d3-shape | 1.3.7 | BSD-3-Clause | [LICENSE](third-party/d3-shape@1.3.7/original/LICENSE) · [copyright headers](third-party/d3-shape@1.3.7/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-shape@1.3.7/metadata.json) |
| d3-shape | 3.2.1 | ISC | [LICENSE](third-party/d3-shape@3.2.1/original/LICENSE) · [copyright headers](third-party/d3-shape@3.2.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-shape@3.2.1/metadata.json) |
| d3-time | 3.1.1 | ISC | [LICENSE](third-party/d3-time@3.1.1/original/LICENSE) · [copyright headers](third-party/d3-time@3.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-time@3.1.1/metadata.json) |
| d3-time-format | 4.1.1 | ISC | [LICENSE](third-party/d3-time-format@4.1.1/original/LICENSE) · [copyright headers](third-party/d3-time-format@4.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-time-format@4.1.1/metadata.json) |
| d3-timer | 3.0.2 | ISC | [LICENSE](third-party/d3-timer@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-timer@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-timer@3.0.2/metadata.json) |
| d3-transition | 3.0.2 | ISC | [LICENSE](third-party/d3-transition@3.0.2/original/LICENSE) · [copyright headers](third-party/d3-transition@3.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-transition@3.0.2/metadata.json) |
| d3-zoom | 3.0.1 | ISC | [LICENSE](third-party/d3-zoom@3.0.1/original/LICENSE) · [copyright headers](third-party/d3-zoom@3.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/d3-zoom@3.0.1/metadata.json) |
| dagre-d3-es | 7.0.11 | MIT | [LICENSE.md](third-party/dagre-d3-es@7.0.11/original/LICENSE.md) · [copyright headers](third-party/dagre-d3-es@7.0.11/COPYRIGHT-HEADERS.txt) · [metadata](third-party/dagre-d3-es@7.0.11/metadata.json) |
| dayjs | 1.11.23 | MIT | [LICENSE](third-party/dayjs@1.11.23/original/LICENSE) · [metadata](third-party/dayjs@1.11.23/metadata.json) |
| debug | 4.4.3 | MIT | [LICENSE](third-party/debug@4.4.3/original/LICENSE) · [copyright headers](third-party/debug@4.4.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/debug@4.4.3/metadata.json) |
| decode-named-character-reference | 1.3.0 | MIT | [license](third-party/decode-named-character-reference@1.3.0/original/license) · [metadata](third-party/decode-named-character-reference@1.3.0/metadata.json) |
| delaunator | 5.1.0 | ISC | [LICENSE](third-party/delaunator@5.1.0/original/LICENSE) · [metadata](third-party/delaunator@5.1.0/metadata.json) |
| dequal | 2.0.3 | MIT | [license](third-party/dequal@2.0.3/original/license) · [metadata](third-party/dequal@2.0.3/metadata.json) |
| devlop | 1.1.0 | MIT | [license](third-party/devlop@1.1.0/original/license) · [metadata](third-party/devlop@1.1.0/metadata.json) |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) | [LICENSE](third-party/dompurify@3.4.17/original/LICENSE) · [LICENSE-MPL](third-party/dompurify@3.4.17/original/LICENSE-MPL) · [license_header](third-party/dompurify@3.4.17/original/src/license_header) · [copyright headers](third-party/dompurify@3.4.17/COPYRIGHT-HEADERS.txt) · [metadata](third-party/dompurify@3.4.17/metadata.json) |
| escape-string-regexp | 5.0.0 | MIT | [license](third-party/escape-string-regexp@5.0.0/original/license) · [metadata](third-party/escape-string-regexp@5.0.0/metadata.json) |
| exsolve | 1.2.0 | MIT | [LICENSE](third-party/exsolve@1.2.0/original/LICENSE) · [metadata](third-party/exsolve@1.2.0/metadata.json) |
| fflate | 0.8.3 | MIT | [LICENSE](third-party/fflate@0.8.3/original/LICENSE) · [metadata](third-party/fflate@0.8.3/metadata.json) |
| globals | 15.15.0 | MIT | [license](third-party/globals@15.15.0/original/license) · [metadata](third-party/globals@15.15.0/metadata.json) |
| hachure-fill | 0.5.2 | MIT | [LICENSE](third-party/hachure-fill@0.5.2/original/LICENSE) · [metadata](third-party/hachure-fill@0.5.2/metadata.json) |
| iconv-lite | 0.6.3 | MIT | [LICENSE](third-party/iconv-lite@0.6.3/original/LICENSE) · [copyright headers](third-party/iconv-lite@0.6.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/iconv-lite@0.6.3/metadata.json) |
| idb | 8.0.3 | ISC | [LICENSE](third-party/idb@8.0.3/original/LICENSE) · [metadata](third-party/idb@8.0.3/metadata.json) |
| internmap | 1.0.1 | ISC | [LICENSE](third-party/internmap@1.0.1/original/LICENSE) · [copyright headers](third-party/internmap@1.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/internmap@1.0.1/metadata.json) |
| internmap | 2.0.3 | ISC | [LICENSE](third-party/internmap@2.0.3/original/LICENSE) · [copyright headers](third-party/internmap@2.0.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/internmap@2.0.3/metadata.json) |
| js-tokens | 3.0.0 | MIT | [LICENSE](third-party/js-tokens@3.0.0/original/LICENSE) · [copyright headers](third-party/js-tokens@3.0.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/js-tokens@3.0.0/metadata.json) |
| katex | 0.16.22 | MIT | [LICENSE](third-party/katex@0.16.22/original/LICENSE) · [copyright headers](third-party/katex@0.16.22/COPYRIGHT-HEADERS.txt) · [metadata](third-party/katex@0.16.22/metadata.json) |
| katex | 0.16.47 | MIT | [LICENSE](third-party/katex@0.16.47/original/LICENSE) · [copyright headers](third-party/katex@0.16.47/COPYRIGHT-HEADERS.txt) · [metadata](third-party/katex@0.16.47/metadata.json) |
| khroma | 2.1.0 | MIT (original license text; manifest omits license) | [license](third-party/khroma@2.1.0/original/license) · [metadata](third-party/khroma@2.1.0/metadata.json) |
| kolorist | 1.8.0 | MIT | [LICENSE](third-party/kolorist@1.8.0/original/LICENSE) · [copyright headers](third-party/kolorist@1.8.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/kolorist@1.8.0/metadata.json) |
| langium | 3.3.1 | MIT | [LICENSE](third-party/langium@3.3.1/original/LICENSE) · [copyright headers](third-party/langium@3.3.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/langium@3.3.1/metadata.json) |
| layout-base | 1.0.2 | MIT | [LICENSE](third-party/layout-base@1.0.2/original/LICENSE) · [copyright headers](third-party/layout-base@1.0.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/layout-base@1.0.2/metadata.json) |
| layout-base | 2.0.1 | MIT | [LICENSE](third-party/layout-base@2.0.1/original/LICENSE) · [copyright headers](third-party/layout-base@2.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/layout-base@2.0.1/metadata.json) |
| local-pkg | 1.2.1 | MIT | [LICENSE](third-party/local-pkg@1.2.1/original/LICENSE) · [metadata](third-party/local-pkg@1.2.1/metadata.json) |
| lodash-es | 4.17.21 | MIT | [LICENSE](third-party/lodash-es@4.17.21/original/LICENSE) · [copyright headers](third-party/lodash-es@4.17.21/COPYRIGHT-HEADERS.txt) · [metadata](third-party/lodash-es@4.17.21/metadata.json) |
| lodash-es | 4.18.1 | MIT | [LICENSE](third-party/lodash-es@4.18.1/original/LICENSE) · [copyright headers](third-party/lodash-es@4.18.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/lodash-es@4.18.1/metadata.json) |
| longest-streak | 3.1.0 | MIT | [license](third-party/longest-streak@3.1.0/original/license) · [metadata](third-party/longest-streak@3.1.0/metadata.json) |
| loose-envify | 1.4.0 | MIT | [LICENSE](third-party/loose-envify@1.4.0/original/LICENSE) · [metadata](third-party/loose-envify@1.4.0/metadata.json) |
| markdown-table | 3.1.0 | MIT | [license](third-party/markdown-table@3.1.0/original/license) · [metadata](third-party/markdown-table@3.1.0/metadata.json) |
| marked | 16.4.2 | MIT | [LICENSE.md](third-party/marked@16.4.2/original/LICENSE.md) · [copyright headers](third-party/marked@16.4.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/marked@16.4.2/metadata.json) |
| mdast-util-find-and-replace | 3.0.2 | MIT | [license](third-party/mdast-util-find-and-replace@3.0.2/original/license) · [metadata](third-party/mdast-util-find-and-replace@3.0.2/metadata.json) |
| mdast-util-find-and-replace | 3.0.4 | MIT | [license](third-party/mdast-util-find-and-replace@3.0.4/original/license) · [metadata](third-party/mdast-util-find-and-replace@3.0.4/metadata.json) |
| mdast-util-from-markdown | 2.0.3 | MIT | [license](third-party/mdast-util-from-markdown@2.0.3/original/license) · [metadata](third-party/mdast-util-from-markdown@2.0.3/metadata.json) |
| mdast-util-gfm | 3.1.0 | MIT | [license](third-party/mdast-util-gfm@3.1.0/original/license) · [metadata](third-party/mdast-util-gfm@3.1.0/metadata.json) |
| mdast-util-gfm-autolink-literal | 2.0.0 | MIT | [license](third-party/mdast-util-gfm-autolink-literal@2.0.0/original/license) · [metadata](third-party/mdast-util-gfm-autolink-literal@2.0.0/metadata.json) |
| mdast-util-gfm-footnote | 2.1.0 | MIT | [license](third-party/mdast-util-gfm-footnote@2.1.0/original/license) · [metadata](third-party/mdast-util-gfm-footnote@2.1.0/metadata.json) |
| mdast-util-gfm-strikethrough | 2.0.1 | MIT | [license](third-party/mdast-util-gfm-strikethrough@2.0.1/original/license) · [metadata](third-party/mdast-util-gfm-strikethrough@2.0.1/metadata.json) |
| mdast-util-gfm-table | 2.0.1 | MIT | [license](third-party/mdast-util-gfm-table@2.0.1/original/license) · [metadata](third-party/mdast-util-gfm-table@2.0.1/metadata.json) |
| mdast-util-gfm-task-list-item | 2.0.1 | MIT | [license](third-party/mdast-util-gfm-task-list-item@2.0.1/original/license) · [metadata](third-party/mdast-util-gfm-task-list-item@2.0.1/metadata.json) |
| mdast-util-math | 3.0.0 | MIT | [license](third-party/mdast-util-math@3.0.0/original/license) · [metadata](third-party/mdast-util-math@3.0.0/metadata.json) |
| mdast-util-phrasing | 4.1.0 | MIT | [license](third-party/mdast-util-phrasing@4.1.0/original/license) · [metadata](third-party/mdast-util-phrasing@4.1.0/metadata.json) |
| mdast-util-to-markdown | 2.2.3 | MIT | [license](third-party/mdast-util-to-markdown@2.2.3/original/license) · [metadata](third-party/mdast-util-to-markdown@2.2.3/metadata.json) |
| mdast-util-to-string | 4.0.0 | MIT | [license](third-party/mdast-util-to-string@4.0.0/original/license) · [metadata](third-party/mdast-util-to-string@4.0.0/metadata.json) |
| mermaid | 11.10.1 | MIT | [LICENSE](third-party/mermaid@11.10.1/original/LICENSE) · [copyright headers](third-party/mermaid@11.10.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/mermaid@11.10.1/metadata.json) |
| micromark | 4.0.3 | MIT | [license](third-party/micromark@4.0.3/original/license) · [metadata](third-party/micromark@4.0.3/metadata.json) |
| micromark-core-commonmark | 2.0.3 | MIT | [license](third-party/micromark-core-commonmark@2.0.3/original/license) · [metadata](third-party/micromark-core-commonmark@2.0.3/metadata.json) |
| micromark-extension-gfm | 3.0.0 | MIT | [license](third-party/micromark-extension-gfm@3.0.0/original/license) · [metadata](third-party/micromark-extension-gfm@3.0.0/metadata.json) |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT | [license](third-party/micromark-extension-gfm-autolink-literal@2.1.0/original/license) · [metadata](third-party/micromark-extension-gfm-autolink-literal@2.1.0/metadata.json) |
| micromark-extension-gfm-footnote | 2.1.0 | MIT | [license](third-party/micromark-extension-gfm-footnote@2.1.0/original/license) · [metadata](third-party/micromark-extension-gfm-footnote@2.1.0/metadata.json) |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT | [license](third-party/micromark-extension-gfm-strikethrough@2.1.0/original/license) · [metadata](third-party/micromark-extension-gfm-strikethrough@2.1.0/metadata.json) |
| micromark-extension-gfm-table | 2.1.1 | MIT | [license](third-party/micromark-extension-gfm-table@2.1.1/original/license) · [metadata](third-party/micromark-extension-gfm-table@2.1.1/metadata.json) |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT | [license](third-party/micromark-extension-gfm-tagfilter@2.0.0/original/license) · [metadata](third-party/micromark-extension-gfm-tagfilter@2.0.0/metadata.json) |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT | [license](third-party/micromark-extension-gfm-task-list-item@2.1.0/original/license) · [metadata](third-party/micromark-extension-gfm-task-list-item@2.1.0/metadata.json) |
| micromark-extension-llm-math | 3.1.0 | MIT | [license](third-party/micromark-extension-llm-math@3.1.0/original/license) · [metadata](third-party/micromark-extension-llm-math@3.1.0/metadata.json) |
| micromark-factory-destination | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-factory-destination@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-factory-destination@2.0.0/original/readme.md) · [metadata](third-party/micromark-factory-destination@2.0.0/metadata.json) |
| micromark-factory-label | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-factory-label@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-factory-label@2.0.0/original/readme.md) · [metadata](third-party/micromark-factory-label@2.0.0/metadata.json) |
| micromark-factory-space | 2.1.0 | MIT | [license](third-party/micromark-factory-space@2.1.0/original/license) · [metadata](third-party/micromark-factory-space@2.1.0/metadata.json) |
| micromark-factory-title | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-factory-title@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-factory-title@2.0.0/original/readme.md) · [metadata](third-party/micromark-factory-title@2.0.0/metadata.json) |
| micromark-factory-whitespace | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-factory-whitespace@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-factory-whitespace@2.0.0/original/readme.md) · [metadata](third-party/micromark-factory-whitespace@2.0.0/metadata.json) |
| micromark-util-character | 2.1.1 | MIT | [license](third-party/micromark-util-character@2.1.1/original/license) · [metadata](third-party/micromark-util-character@2.1.1/metadata.json) |
| micromark-util-chunked | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-chunked@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-chunked@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-chunked@2.0.0/metadata.json) |
| micromark-util-classify-character | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-classify-character@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-classify-character@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-classify-character@2.0.0/metadata.json) |
| micromark-util-combine-extensions | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-combine-extensions@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-combine-extensions@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-combine-extensions@2.0.0/metadata.json) |
| micromark-util-decode-numeric-character-reference | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-decode-numeric-character-reference@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-decode-numeric-character-reference@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-decode-numeric-character-reference@2.0.0/metadata.json) |
| micromark-util-decode-string | 2.0.1 | MIT | [license](third-party/micromark-util-decode-string@2.0.1/original/license) · [metadata](third-party/micromark-util-decode-string@2.0.1/metadata.json) |
| micromark-util-edit-map | 1.0.0 | MIT | [license](third-party/micromark-util-edit-map@1.0.0/original/license) · [metadata](third-party/micromark-util-edit-map@1.0.0/metadata.json) |
| micromark-util-encode | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-encode@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-encode@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-encode@2.0.0/metadata.json) |
| micromark-util-html-tag-name | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-html-tag-name@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-html-tag-name@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-html-tag-name@2.0.0/metadata.json) |
| micromark-util-normalize-identifier | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-normalize-identifier@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-normalize-identifier@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-normalize-identifier@2.0.0/metadata.json) |
| micromark-util-resolve-all | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-resolve-all@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-resolve-all@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-resolve-all@2.0.0/metadata.json) |
| micromark-util-sanitize-uri | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-sanitize-uri@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-sanitize-uri@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-sanitize-uri@2.0.0/metadata.json) |
| micromark-util-subtokenize | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-subtokenize@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-subtokenize@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-subtokenize@2.0.0/metadata.json) |
| micromark-util-symbol | 2.0.0 | MIT | [MIT-micromark.txt](third-party/micromark-util-symbol@2.0.0/original/MIT-micromark.txt) · [readme.md](third-party/micromark-util-symbol@2.0.0/original/readme.md) · [metadata](third-party/micromark-util-symbol@2.0.0/metadata.json) |
| micromark-util-types | 2.0.3 | MIT | [license](third-party/micromark-util-types@2.0.3/original/license) · [metadata](third-party/micromark-util-types@2.0.3/metadata.json) |
| mlly | 1.8.2 | MIT | [LICENSE](third-party/mlly@1.8.2/original/LICENSE) · [metadata](third-party/mlly@1.8.2/metadata.json) |
| ms | 2.1.3 | MIT | [license.md](third-party/ms@2.1.3/original/license.md) · [copyright headers](third-party/ms@2.1.3/COPYRIGHT-HEADERS.txt) · [metadata](third-party/ms@2.1.3/metadata.json) |
| package-manager-detector | 1.9.0 | MIT | [LICENSE](third-party/package-manager-detector@1.9.0/original/LICENSE) · [metadata](third-party/package-manager-detector@1.9.0/metadata.json) |
| path-data-parser | 0.1.0 | MIT | [LICENSE](third-party/path-data-parser@0.1.0/original/LICENSE) · [metadata](third-party/path-data-parser@0.1.0/metadata.json) |
| pathe | 2.0.3 | MIT | [LICENSE](third-party/pathe@2.0.3/original/LICENSE) · [metadata](third-party/pathe@2.0.3/metadata.json) |
| pkg-types | 1.3.1 | MIT | [LICENSE](third-party/pkg-types@1.3.1/original/LICENSE) · [metadata](third-party/pkg-types@1.3.1/metadata.json) |
| pkg-types | 2.4.0 | MIT | [LICENSE](third-party/pkg-types@2.4.0/original/LICENSE) · [metadata](third-party/pkg-types@2.4.0/metadata.json) |
| points-on-curve | 0.2.0 | MIT | [LICENSE](third-party/points-on-curve@0.2.0/original/LICENSE) · [metadata](third-party/points-on-curve@0.2.0/metadata.json) |
| points-on-path | 0.2.1 | MIT | [LICENSE](third-party/points-on-path@0.2.1/original/LICENSE) · [metadata](third-party/points-on-path@0.2.1/metadata.json) |
| prismjs | 1.30.0 | MIT | [LICENSE](third-party/prismjs@1.30.0/original/LICENSE) · [copyright headers](third-party/prismjs@1.30.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/prismjs@1.30.0/metadata.json) |
| quansync | 0.2.11 | MIT | [LICENSE.md](third-party/quansync@0.2.11/original/LICENSE.md) · [copyright headers](third-party/quansync@0.2.11/COPYRIGHT-HEADERS.txt) · [metadata](third-party/quansync@0.2.11/metadata.json) |
| react | 18.3.1 | MIT | [LICENSE](third-party/react@18.3.1/original/LICENSE) · [copyright headers](third-party/react@18.3.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/react@18.3.1/metadata.json) |
| react-dom | 18.3.1 | MIT | [LICENSE](third-party/react-dom@18.3.1/original/LICENSE) · [copyright headers](third-party/react-dom@18.3.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/react-dom@18.3.1/metadata.json) |
| robust-predicates | 3.0.3 | Unlicense | [LICENSE](third-party/robust-predicates@3.0.3/original/LICENSE) · [metadata](third-party/robust-predicates@3.0.3/metadata.json) |
| roughjs | 4.6.6 | MIT | [LICENSE](third-party/roughjs@4.6.6/original/LICENSE) · [metadata](third-party/roughjs@4.6.6/metadata.json) |
| rw | 1.3.3 | BSD-3-Clause | [LICENSE](third-party/rw@1.3.3/original/LICENSE) · [metadata](third-party/rw@1.3.3/metadata.json) |
| safer-buffer | 2.1.2 | MIT | [LICENSE](third-party/safer-buffer@2.1.2/original/LICENSE) · [metadata](third-party/safer-buffer@2.1.2/metadata.json) |
| scheduler | 0.23.2 | MIT | [LICENSE](third-party/scheduler@0.23.2/original/LICENSE) · [copyright headers](third-party/scheduler@0.23.2/COPYRIGHT-HEADERS.txt) · [metadata](third-party/scheduler@0.23.2/metadata.json) |
| stylis | 4.4.0 | MIT | [LICENSE](third-party/stylis@4.4.0/original/LICENSE) · [metadata](third-party/stylis@4.4.0/metadata.json) |
| tinyexec | 1.3.1 | MIT | [LICENSE](third-party/tinyexec@1.3.1/original/LICENSE) · [metadata](third-party/tinyexec@1.3.1/metadata.json) |
| ts-dedent | 2.3.0 | MIT | [LICENSE](third-party/ts-dedent@2.3.0/original/LICENSE) · [metadata](third-party/ts-dedent@2.3.0/metadata.json) |
| ufo | 1.6.4 | MIT | [LICENSE](third-party/ufo@1.6.4/original/LICENSE) · [metadata](third-party/ufo@1.6.4/metadata.json) |
| unist-util-is | 6.0.1 | MIT | [license](third-party/unist-util-is@6.0.1/original/license) · [metadata](third-party/unist-util-is@6.0.1/metadata.json) |
| unist-util-remove-position | 5.0.0 | MIT | [license](third-party/unist-util-remove-position@5.0.0/original/license) · [metadata](third-party/unist-util-remove-position@5.0.0/metadata.json) |
| unist-util-stringify-position | 4.0.0 | MIT | [license](third-party/unist-util-stringify-position@4.0.0/original/license) · [metadata](third-party/unist-util-stringify-position@4.0.0/metadata.json) |
| unist-util-visit | 5.2.0 | MIT | [license](third-party/unist-util-visit@5.2.0/original/license) · [metadata](third-party/unist-util-visit@5.2.0/metadata.json) |
| unist-util-visit-parents | 6.1.0 | MIT | [license](third-party/unist-util-visit-parents@6.1.0/original/license) · [metadata](third-party/unist-util-visit-parents@6.1.0/metadata.json) |
| use-sync-external-store | 1.2.0 | MIT | [LICENSE](third-party/use-sync-external-store@1.2.0/original/LICENSE) · [copyright headers](third-party/use-sync-external-store@1.2.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/use-sync-external-store@1.2.0/metadata.json) |
| uuid | 11.1.1 | MIT | [LICENSE.md](third-party/uuid@11.1.1/original/LICENSE.md) · [copyright headers](third-party/uuid@11.1.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/uuid@11.1.1/metadata.json) |
| vscode-jsonrpc | 8.2.0 | MIT | [License.txt](third-party/vscode-jsonrpc@8.2.0/original/License.txt) · [copyright headers](third-party/vscode-jsonrpc@8.2.0/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-jsonrpc@8.2.0/metadata.json) |
| vscode-languageserver | 9.0.1 | MIT | [License.txt](third-party/vscode-languageserver@9.0.1/original/License.txt) · [copyright headers](third-party/vscode-languageserver@9.0.1/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-languageserver@9.0.1/metadata.json) |
| vscode-languageserver-protocol | 3.17.5 | MIT | [License.txt](third-party/vscode-languageserver-protocol@3.17.5/original/License.txt) · [copyright headers](third-party/vscode-languageserver-protocol@3.17.5/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-languageserver-protocol@3.17.5/metadata.json) |
| vscode-languageserver-textdocument | 1.0.16 | MIT | [License.txt](third-party/vscode-languageserver-textdocument@1.0.16/original/License.txt) · [copyright headers](third-party/vscode-languageserver-textdocument@1.0.16/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-languageserver-textdocument@1.0.16/metadata.json) |
| vscode-languageserver-types | 3.17.5 | MIT | [License.txt](third-party/vscode-languageserver-types@3.17.5/original/License.txt) · [copyright headers](third-party/vscode-languageserver-types@3.17.5/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-languageserver-types@3.17.5/metadata.json) |
| vscode-uri | 3.0.8 | MIT | [LICENSE.md](third-party/vscode-uri@3.0.8/original/LICENSE.md) · [copyright headers](third-party/vscode-uri@3.0.8/COPYRIGHT-HEADERS.txt) · [metadata](third-party/vscode-uri@3.0.8/metadata.json) |
| zustand | 4.4.7 | MIT | [LICENSE](third-party/zustand@4.4.7/original/LICENSE) · [metadata](third-party/zustand@4.4.7/metadata.json) |
| zwitch | 2.0.4 | MIT | [license](third-party/zwitch@2.0.4/original/license) · [metadata](third-party/zwitch@2.0.4/metadata.json) |
