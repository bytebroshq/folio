# Folio CLI

A local-first CLI for working with a Folio knowledge repo.

Folio keeps your knowledgebase in git. You edit locally, isolate changes in amendments, and publish amendments as draft pull requests for review.

## Install

Prerequisites:

- Node.js 22+
- git
- GitHub CLI: `gh auth login`

Install:

```bash
curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
```

The installer places `folio` at:

```bash
~/.config/folio/bin/folio
```

A fresh install is not bound to any repo. Start by binding your knowledge repo:

```bash
folio bind <owner/repo>
```

Example:

```bash
folio bind bytebroshq/knowledge
```

## Mental model

Folio has one bound git repo.

```text
~/.config/folio/
  config.yml
  stores/
    .main/                 # canonical checkout of the bound repo
    amendments/
      my-topic/             # isolated worktree for one amendment
```

You normally do not edit `.main` directly. You create an amendment, edit files in that amendment, then sync it to a draft PR.

## Basic workflow

Bind once:

```bash
folio bind <owner/repo>
```

Create an amendment:

```bash
folio switch -c my-topic
```

Edit files here:

```bash
~/.config/folio/stores/amendments/my-topic/leaves/
```

Check state:

```bash
folio status
```

Publish or update the draft PR:

```bash
folio sync -m "describe the change"
```

List amendments:

```bash
folio list
```

Switch amendments:

```bash
folio switch my-topic
```

Drop an amendment:

```bash
folio drop my-topic --force
```

## Commands

```text
folio bind <owner/repo> [--web]      bind this machine to a knowledge repo
folio status                         show current state
folio list                           list local amendments
folio switch                         list local amendments
folio switch -c <topic>              create and enter an amendment
folio switch <topic>                 enter an existing amendment
folio sync [-m "message"]            commit, rebase, push, and open/update draft PR
folio drop <topic> --force           delete a local amendment and its remote branch
folio web                            open the web review surface
folio config                         show config
folio config <key> <value>           set config
```

## Web

The CLI can open Folio Web for the bound repo:

```bash
folio web
```

Set the Web URL:

```bash
folio config web https://folio-web.bytebros.workers.dev
```

`folio bind --web <owner/repo>` binds locally, then opens the repo in Folio Web.

The CLI does not manage GitHub App installation or web auth. It opens the repo URL; the Web app handles login, setup, and review.

## Config

Show config:

```bash
folio config
```

Fresh config starts clean:

```yaml
remote:
store: git
active:
```

Set values:

```bash
folio config web https://folio-web.bytebros.workers.dev
```

Rebind to a different repo:

```bash
folio bind <owner/repo> --force
```

Rebinding removes the local store and amendments for the previous repo.

## Development

Build the distributable JS file:

```bash
cd packages/cli
bun install
bun run build
```

The installer downloads the prebuilt file from:

```text
packages/cli/dist/folio.js
```
