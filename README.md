# vscode-geos-goc

VSCode language support for GOC files (`.goc`, `.goh`) and GEOS parameter
files (`.gp`) from the PC/GEOS/FreeGEOS SDK: syntax highlighting, folding,
hover tooltips, outline, include navigation, and diagnostics.

Author: Jirka Kunze
License: Apache License 2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE))

## Requirements

- [Visual Studio Code](https://code.visualstudio.com/) ≥ 1.75
- [Node.js](https://nodejs.org/) ≥ 18 (for building/development; not
  required to simply install a prebuilt `.vsix`)
- A PC/GEOS SDK with the `ROOT_DIR` environment variable set (needed for
  include navigation; all other features work without an SDK as well)

## Installation

### Option A: Install a prebuilt `.vsix`

1. Download the `.vsix` file (see [Build](#build) to create it yourself, or
   grab it from this repo's [releases](../../releases) if available).
2. Install it in VSCode:
   ```bash
   code --install-extension vscode-geos-goc-0.1.0.vsix
   ```
   Alternatively via the GUI: Extensions view (`Ctrl+Shift+X`) → `...` menu
   → "Install from VSIX..." → select the file.

### Option B: Build from source

See [Build](#build).

## Build

```bash
git clone <repo-url>
cd vscode-geos-goc
npm install
npm run compile
```

`npm run compile` compiles `src/extension.ts` into `out/extension.js`
(TypeScript → JavaScript). To automatically recompile on changes:

```bash
npm run watch
```

### Package as `.vsix`

```bash
npm install -g @vscode/vsce
npm run package
```

This produces `vscode-geos-goc-0.1.0.vsix` in the project directory,
installable as described under [Option A](#option-a-install-a-prebuilt-vsix).

## Development / Testing

1. Open the repo in VSCode and run `npm install`.
2. Press `F5` – this launches an Extension Development Host and
   automatically opens the bundled `examples/` folder as the workspace
   (`.vscode/launch.json` also sets `ROOT_DIR=examples/fake-sdk`, so include
   navigation works right away without a real SDK).
3. In the Development Host, open `examples/sample.goc` and try things out:
   - Highlighting and folding are visible immediately.
   - Hover the mouse over `@class`, `@object`, or any other Goc keyword →
     hover tooltip.
   - `Ctrl+Shift+O` opens the outline with `MyObjectClass`, `MyObject`,
     `MSG_MY_OBJECT_UPDATE`, `MyDataResource`.
   - Ctrl+click `geos.h`, `ec.h`, or `stdapp.goh` jumps to the respective
     file under `fake-sdk/CInclude`.
   - Delete an `@endc` → a warning appears in "Problems" and as an
     underline in the editor.
4. Open `examples/bad-include.goc` to see the `.goh`/`#include` error.

Changes to `src/extension.ts` require `npm run compile` (or a running
`npm run watch`) and a restart of the Development Host
(`Ctrl+R`/`Cmd+R` in the Development Host window). Changes to `data/*.json`,
the `syntaxes/*.tmLanguage.json` files, or the `language-configuration*.json`
files take effect after restarting the Development Host without needing to
recompile.

## Configuration

| Setting                          | Default         | Description |
|-----------------------------------|-----------------|--------------|
| `geos-goc.sdkEnvVar`              | `"ROOT_DIR"`    | Name of the environment variable pointing to the SDK root directory. |
| `geos-goc.sdkIncludeSubdirs`      | `["CInclude"]`  | Subdirectory/ies relative to the SDK root that are searched for `<...>` includes. |
| `geos-goc.includePaths`           | `[]`            | Additional, absolute include search paths (supports `${workspaceFolder}`). |

Example (workspace or user `settings.json`):

```json
{
  "geos-goc.sdkEnvVar": "ROOT_DIR",
  "geos-goc.sdkIncludeSubdirs": ["CInclude"]
}
```

This already matches the default – explicit configuration is only needed if
your setup differs (e.g. a different variable name, additional include
subdirectories).

## Features at a glance

- **Syntax highlighting** for `.goc`/`.goh` (all 54 Goc directives) and `.gp`
  (all 20 parameter fields, including allowed values/flags).
- **Folding** for `@start`/`@end`, `@class`/`@endc`, `@deflib`/`@endlib`, and
  `@if`/`@ifdef`/`@ifndef`/`@endif`.
- **Hover tooltips**: hovering over a Goc keyword (e.g. `@vardataAlias`) or
  a `.gp` field (e.g. `resource`) shows syntax, description, and "See also"
  – the data source is `data/goc-keywords.json`/`data/gp-keywords.json`.
- **Outline / breadcrumbs** (`.goc`): `@class`/`@classdecl`, `@object`,
  `@method`, and `@start` resource blocks appear in the Outline view and via
  `Ctrl+Shift+O`.
- **Include navigation** (`#include` and `@include`): Ctrl+click on a
  filename jumps to the referenced file – whether it's in the SDK or in
  your own project.
- **Diagnostics**:
  - warns when a block pair (`@start`/`@end`, `@class`/`@endc`,
    `@deflib`/`@endlib`, `@if(def/ndef)`/`@endif`) is not properly closed or
    nested.
  - reports an error when a `.goh` file is included via `#include` instead
    of `@include` (the C preprocessor/compiler cannot process the Goc
    syntax it contains).
  - warns when an include target cannot be found in any configured search
    path.

## Structure

```
vscode-geos-goc/
├── package.json                    # Extension manifest (languages, grammars, settings, ...)
├── language-configuration.json     # Comments, brackets, folding for .goc/.goh
├── language-configuration-gp.json  # same, for .gp
├── syntaxes/
│   ├── goc.tmLanguage.json         # TextMate grammar for GOC
│   └── gp.tmLanguage.json          # TextMate grammar for .gp
├── data/
│   ├── goc-keywords.json           # All 54 Goc directives with syntax/description/seeAlso
│   └── gp-keywords.json            # All 20 .gp fields with syntax/description
├── src/
│   └── extension.ts                # Hover provider, outline, include navigation, diagnostics
├── examples/
│   ├── sample.goc                  # Test file (highlighting, folding, outline, include navigation)
│   ├── bad-include.goc             # Demonstrates the .goh/#include error
│   ├── sample.gp                   # Test file for .gp highlighting
│   └── fake-sdk/CInclude/          # Minimal "SDK" for the example setup (via ROOT_DIR in launch.json)
└── tsconfig.json
```

## Foldable blocks (folding)

In addition to regular `{ }` blocks (handled automatically by VSCode), the
following Goc directive pairs are configured as foldable regions (in
`language-configuration.json`, `folding.markers` section):

| Opens     | Closes    | Use                    |
|-----------|-----------|-------------------------|
| `@start`  | `@end`    | Resource block          |
| `@class`  | `@endc`   | Class definition        |
| `@deflib` | `@endlib` | Library header file     |
| `@if`     | `@endif`  | Conditional compilation |
| `@ifdef`  | `@endif`  | Conditional compilation |
| `@ifndef` | `@endif`  | Conditional compilation |

`@classdecl` intentionally has no counterpart and is therefore not treated
as a fold marker. Automatic indentation (`indentationRules`) remains
unchanged, based purely on `{ }` brackets, since indenting based on these
directives isn't common practice in the GOC community.

## Hover tooltips

`src/extension.ts` registers one hover provider each for `goc` and
`geos-gp`. Both look up the word under the cursor in the respective
`data/*.json` file and show syntax + description + "See also". For `.goc`,
a custom word pattern (`@?[A-Za-z_][A-Za-z0-9_]*`) is used so that, for
example, `@vardataAlias` is recognized as a whole.

**Adding/changing hover text:** simply edit the entries in
`data/goc-keywords.json` or `data/gp-keywords.json` – no need to recompile
the logic, just reload the extension (or restart the Development Host / VSCode).

## Outline (document symbols)

`GocDocumentSymbolProvider` in `src/extension.ts` is a lightweight,
regex-based scanner (not a full parser). It recognizes:

- `@class <Name>, <Super>; ... @endc` → symbol of type "Class"
- `@classdecl <Name>` → symbol of type "Class declaration" (single line)
- `@object <Class> <Name> = { ... }` → symbol of type "Object"; brace
  matching accounts for strings/comments so that `{`/`}` inside them aren't
  counted incorrectly
- `@method <Class>, <Message> { ... }` → symbol of type "Method"
- `@start <Name> ... @end` → symbol of type "Resource block"

Symbols are currently reported **flat** (not nested), i.e. an `@method`
inside an `@class` block appears as a standalone entry rather than as a
child of the class symbol.

## Include navigation (#include and @include)

Both `#include <file.h>`/`"file.h"` and `@include <file.goh>`/`"file.goh"`
are recognized and turned into clickable links to the resolved file. The
resolution order matches the description in the GOC reference:

- **Quotes** (`"..."`): first in the directory of the current file, then in
  the search paths.
- **Angle brackets** (`<...>`): first in the search paths, then (as a
  fallback) in the directory of the current file.

The search paths are assembled from (in this order):

1. `geos-goc.includePaths` – explicitly configured, absolute directories.
2. `<SDK root>/<sdkIncludeSubdirs>` – the SDK root is read from the
   `ROOT_DIR` environment variable (see [Configuration](#configuration)).
3. The standard `INCLUDE` environment variable, if already set by the
   Watcom toolchain (`:`- or `;`-separated).

**Rule: `.goh` only via `@include`.** `.goh` files contain Goc syntax (e.g.
`@classdecl`) that the C preprocessor/Watcom compiler cannot process. A
`#include <something.goh>` is therefore always flagged as an **error**,
regardless of whether the file can be found.

## Diagnostics: block pair balance

`checkBlockBalance()` in `src/extension.ts` scans `.goc` documents line by
line using a stack and reports:

- a closing keyword without a matching opening one (e.g. `@endc` without a
  preceding `@class`)
- a block pair left unclosed at the end of the file

The check runs on open and – with a 400 ms debounce – on every change to a
`.goc` document. It only checks Goc **directives** (`@start`/`@end` etc.),
not the balance of regular `{ }` braces in C code.

## Extending

The grammar in `syntaxes/goc.tmLanguage.json` is organized into named
sections (`repository`), including:

- `comments`, `strings`, `numbers`, `preprocessor` – generic C
- `goc-object-block`, `goc-keywords` – `@class`/`@object`/`@method` etc.
- `geos-messages` – `MSG_*`, `C_MSG_*`, `ATTR_*`, `GI_*`
- `geos-types` – `word`, `dword`, `fixed_t`, `optr`, `ChunkHandle`, ...

**Adding new keywords/types:** extend the appropriate regex in the relevant
rule (e.g. add more types from your codebase to `geos-types`).

**Other possible extensions:**
- Snippets: `contributes.snippets` in `package.json` plus a `snippets/goc.json`.
- Commands/build integration (glue/swat/DOSBox workflow directly from VSCode).
- `.gp` field-value validation (e.g. warn about invalid `type` attributes).
- Nested outline (methods as children of their class).
- Language server (go-to-definition, find references for `MSG_*`).

## Known limitations

- Highlighting, outline, include navigation, and diagnostics are all
  regex-/scan-based rather than built on a real parser. Very unusually
  formatted code (e.g. multiple directives on one line) can be misdetected.
- Include resolution does not account for conditional compilation
  (`@ifdef`/`#ifdef`) – an include inside an inactive branch is still
  resolved/checked.
- The Goc directives (`@class`, `@object`, `@message`, ...) come from the
  complete reference list (54 entries). The GEOS types (`word`, `fixed_t`,
  `optr`, ...) and message/attribute prefixes (`MSG_`, `ATTR_`, `GI_`, ...),
  on the other hand, are still a starting point derived from context and
  should be extended as needed.
- In `.gp` files, comments start with `#` (to end of line).
- In `.gp` files, the mapping of field → allowed values (e.g. `type` only
  with `process|driver|appl|library|single|...`) is not yet checked
  contextually – all known values are highlighted globally, regardless of
  the surrounding field.

## License and attribution

The code of this extension is licensed under the Apache License 2.0 (see
[LICENSE](LICENSE)).

The keyword reference data in `data/goc-keywords.json` and
`data/gp-keywords.json` (syntax and short descriptions) is extracted from
the official documentation of the FreeGEOS project, also licensed under the
Apache License 2.0. See [NOTICE](NOTICE) for details.
