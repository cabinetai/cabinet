# Contributing Translations to draw.io

We welcome translation contributions via pull requests.

## File Format

Each file is a simple `key=value` text file:

- `dia.txt` - English (reference/source language)
- `dia_{lang}.txt` - Translations (e.g. `dia_fr.txt` for French)

Keys must match those in `dia.txt` exactly. Values are the translated strings.

## How to Contribute

1. Fork this repository
2. Edit the relevant `dia_{lang}.txt` file
3. Submit a pull request against the `dev` branch

### Adding or Updating Translations

- Use `dia.txt` as the reference for all keys
- Keep keys in the same order as `dia.txt`
- Leave a value empty if no translation is available (the app falls back to English)
- Do not add or remove keys - keys are managed in `dia.txt`

### Adding a New Language

Open an issue first to discuss. A new language requires:

1. A new `dia_{lang}.txt` file with the same keys as `dia.txt`
2. An entry in `mxLanguageMap` in `src/main/webapp/js/diagramly/Init.js` (in the main [drawio](https://github.com/jgraph/drawio) repo)

## Format Rules

- **Encoding**: UTF-8
- **Line format**: `key=value` (no spaces around `=`)
- **No HTML**: Use `&lt;` and `&gt;` instead of `<` and `>`
- **Placeholders**: `{1}`, `{2}`, etc. must be preserved in translations
- **RTL languages** (Arabic, Persian, Hebrew): Wrap values with Unicode bidi markers (U+202B before, U+202C after)
- **No trailing whitespace**
- **No blank lines** between entries

## Review Process

All changes are reviewed when the submodule is updated in the main draw.io repository.
