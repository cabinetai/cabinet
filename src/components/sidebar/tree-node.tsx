"use client";

import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import {
  Archive,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Trash2,
  FilePlus,
  Pencil,
  Eye,
  Code2,
  AppWindow,
  GitBranch,
  Copy,
  ClipboardCopy,
  Link2,
  Link2Off,
  TriangleAlert,
  ArrowRightLeft,
  Loader2,
  Upload,
  FilePlus2,
  FolderInput,
  Settings2,
  Cloud,
  History,
  Search,
  Download,
  Sparkles,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openFileHistory } from "@/components/editor/version-history";
import { assetUrlFor, contentUrlFor } from "@/lib/cabinets/asset-url";
import {
  copyMarkdown,
  copyForLlm,
  copyAsHtml,
  downloadMarkdown,
  downloadRawFile,
  formatBytes,
} from "@/lib/markdown/page-export";
import {
  isHtmlPath,
  setHtmlViewMode,
  type HtmlViewMode,
} from "@/lib/ui/html-view-mode";
import { decodeDrivePath } from "@/lib/google-drive/paths";
import type { TreeNode as TreeNodeType } from "@/types";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuGroup,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkRepoDialog } from "./link-repo-dialog";
import { ConnectKnowledgeDialog } from "./connect-knowledge-dialog";
import { ConnectGithubDialog } from "./connect-github-dialog";
import { NotionConnectDialog } from "./notion-connect-dialog";
import { AppleNotesConnectDialog } from "./apple-notes-connect-dialog";
import { ConnectDriveDialog } from "./connect-drive-dialog";
import { providerLogo } from "@/lib/knowledge-sources/providers";
import type { KnowledgeProviderId } from "@/lib/knowledge-sources/store";
import { GoogleNodeIcon } from "./google-node-icon";
import { NewCabinetDialog } from "./new-cabinet-dialog";
import { NewFileDialog } from "./new-file-dialog";
import { EditSymlinkDialog } from "./edit-symlink-dialog";
import { FileSettingsDialog } from "./file-settings-dialog";
import { useFileImport } from "./use-file-import";
import { getDataDir } from "@/lib/data-dir-cache";
import { isMacPlatform, isEditableTarget, formatShortcut } from "@/lib/keys";
import { useLocale } from "@/i18n/use-locale";

function getFileIconPath(filename: string): string {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? "." + parts.pop()!.toLowerCase() : "";
  const lowerName = filename.toLowerCase();

  // Special exact filename checks
  if (lowerName === "package.json") return "/icons/npm.svg";
  if (lowerName === "package-lock.json") return "/icons/lock.svg";
  if (lowerName === "pnpm-lock.yaml") return "/icons/lock.svg";
  if (lowerName === "yarn.lock") return "/icons/lock.svg";
  if (lowerName === "cargo.lock") return "/icons/lock.svg";
  if (lowerName === "composer.lock") return "/icons/lock.svg";
  if (lowerName === "gemfile.lock") return "/icons/lock.svg";
  if (lowerName === "dockerfile" || lowerName === "docker-compose.yml" || lowerName === "docker-compose.yaml") return "/icons/docker.svg";
  if (lowerName === "license" || lowerName === "copying" || lowerName === "unlicense") return "/icons/license.svg";
  if (lowerName === "makefile" || lowerName === "gnumakefile") return "/icons/makefile.svg";
  if (lowerName === "eslint.config.js" || lowerName === "eslint.config.mjs" || lowerName === "eslint.config.cjs" || lowerName === ".eslintrc.json" || lowerName === ".eslintrc.js" || lowerName === ".eslintrc.yml" || lowerName === ".eslintrc.yaml" || lowerName === ".eslintrc") return "/icons/eslint.svg";
  if (lowerName === "tsconfig.json") return "/icons/tsconfig.svg";
  if (lowerName === "jsconfig.json") return "/icons/jsconfig.svg";
  if (lowerName === "vite.config.ts" || lowerName === "vite.config.js") return "/icons/vite.svg";
  if (lowerName === "next.config.js" || lowerName === "next.config.ts" || lowerName === "next.config.mjs") return "/icons/next.svg";
  if (lowerName === "tailwind.config.js" || lowerName === "tailwind.config.ts" || lowerName === "tailwind.config.cjs") return "/icons/tailwindcss.svg";
  if (lowerName === ".editorconfig") return "/icons/editorconfig.svg";
  if (lowerName === ".gitignore" || lowerName === ".gitconfig" || lowerName === ".gitattributes") return "/icons/git.svg";
  if (lowerName === ".prettierrc" || lowerName === ".prettierrc.json" || lowerName === ".prettierrc.js" || lowerName === ".prettierrc.yml" || lowerName === ".prettierrc.yaml") return "/icons/prettier.svg";
  if (lowerName === "babel.config.js" || lowerName === "babel.config.json" || lowerName === ".babelrc") return "/icons/babel.svg";
  if (lowerName === "webpack.config.js" || lowerName === "webpack.config.ts") return "/icons/webpack.svg";
  if (lowerName === "readme" || lowerName === "readme.md" || lowerName === "readme.txt") return "/icons/readme.svg";
  if (lowerName === "changelog" || lowerName === "changelog.md" || lowerName === "changelog.txt") return "/icons/changelog.svg";
  if (lowerName === "authors" || lowerName === "authors.md" || lowerName === "authors.txt") return "/icons/authors.svg";
  if (lowerName === "contributing" || lowerName === "contributing.md") return "/icons/contributing.svg";
  if (lowerName === "conduct" || lowerName === "conduct.md") return "/icons/conduct.svg";
  if (lowerName === "credits" || lowerName === "credits.md") return "/icons/credits.svg";
  if (lowerName === "roadmap" || lowerName === "roadmap.md") return "/icons/roadmap.svg";
  if (lowerName.endsWith(".d.ts")) return "/icons/typescript-def.svg";

  // Specific file extension mappings
  switch (ext) {
    case ".md":
      return "/icons/markdown.svg";
    case ".mdx":
      return "/icons/mdx.svg";
    case ".pdf":
      return "/icons/pdf.svg";
    case ".html":
    case ".htm":
      return "/icons/html.svg";
    case ".js":
    case ".cjs":
    case ".mjs":
      return "/icons/javascript.svg";
    case ".jsx":
      return "/icons/react.svg";
    case ".ts":
      return "/icons/typescript.svg";
    case ".tsx":
      return "/icons/react_ts.svg";
    case ".css":
      return "/icons/css.svg";
    case ".scss":
    case ".sass":
      return "/icons/sass.svg";
    case ".less":
      return "/icons/less.svg";
    case ".json":
    case ".jsonc":
    case ".json5":
      return "/icons/json.svg";
    case ".yaml":
    case ".yml":
      return "/icons/yaml.svg";
    case ".toml":
      return "/icons/toml.svg";
    case ".xml":
      return "/icons/xml.svg";
    case ".py":
      return "/icons/python.svg";
    case ".pyc":
    case ".pyo":
    case ".pyd":
      return "/icons/python-misc.svg";
    case ".rs":
      return "/icons/rust.svg";
    case ".go":
      return "/icons/go.svg";
    case ".c":
      return "/icons/c.svg";
    case ".h":
      return "/icons/h.svg";
    case ".cpp":
    case ".cc":
    case ".cxx":
      return "/icons/cpp.svg";
    case ".hpp":
    case ".hh":
    case ".hxx":
      return "/icons/hpp.svg";
    case ".tex":
    case ".latex":
      return "/icons/latexmk.svg";
    case ".bib":
      return "/icons/bibliography.svg";
    case ".bst":
      return "/icons/bibtex-style.svg";
    case ".typ":
      return "/icons/typst.svg";
    case ".mermaid":
    case ".mmd":
      return "/icons/mermaid.svg";
    case ".docx":
    case ".doc":
      return "/icons/word.svg";
    case ".xlsx":
    case ".xls":
      return "/icons/table.svg";
    case ".csv":
      return "/icons/table.svg";
    case ".pptx":
    case ".ppt":
      return "/icons/powerpoint.svg";
    case ".ipynb":
      return "/icons/jupyter.svg";
    case ".mp3":
    case ".wav":
    case ".ogg":
    case ".m4a":
    case ".flac":
    case ".aac":
      return "/icons/audio.svg";
    case ".mp4":
    case ".mkv":
    case ".avi":
    case ".mov":
    case ".webm":
    case ".flv":
      return "/icons/video.svg";
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
    case ".ico":
    case ".tiff":
    case ".bmp":
      return "/icons/image.svg";
    case ".svg":
      return "/icons/svg.svg";
    case ".sh":
    case ".bash":
    case ".zsh":
      return "/icons/bash.svg";
    case ".sql":
      return "/icons/database.svg";
    case ".db":
    case ".sqlite":
    case ".sqlite3":
      return "/icons/database.svg";
    case ".crt":
    case ".pem":
    case ".der":
    case ".p12":
    case ".cer":
      return "/icons/certificate.svg";
    case ".key":
    case ".pub":
      return "/icons/key.svg";
    case ".zip":
    case ".tar":
    case ".gz":
    case ".rar":
    case ".7z":
    case ".tgz":
    case ".xz":
    case ".bz2":
      return "/icons/zip.svg";
    case ".epub":
      return "/icons/epub.svg";
    case ".eml":
    case ".msg":
      return "/icons/email.svg";
    case ".vue":
      return "/icons/vue.svg";
    case ".svelte":
      return "/icons/svelte.svg";
    case ".astro":
      return "/icons/astro.svg";
    case ".graphql":
    case ".gql":
      return "/icons/graphql.svg";
    case ".wasm":
      return "/icons/webassembly.svg";
    case ".sol":
      return "/icons/solidity.svg";
    case ".prisma":
      return "/icons/prisma.svg";
    case ".diff":
    case ".patch":
      return "/icons/diff.svg";
    case ".log":
      return "/icons/log.svg";
    case ".clj":
    case ".cljs":
    case ".cljc":
    case ".edn":
      return "/icons/clojure.svg";
    case ".dart":
      return "/icons/dart.svg";
    case ".elm":
      return "/icons/elm.svg";
    case ".erl":
    case ".hrl":
      return "/icons/erlang.svg";
    case ".fs":
    case ".fsi":
    case ".fsx":
      return "/icons/fsharp.svg";
    case ".hs":
    case ".lhs":
      return "/icons/haskell.svg";
    case ".ml":
      return "/icons/ocaml.svg";
    case ".ex":
      return "/icons/elixir.svg";
    case ".groovy":
    case ".gvy":
    case ".gy":
    case ".gsh":
      return "/icons/groovy.svg";
    case ".r":
    case ".rmd":
      return "/icons/r.svg";
    case ".nim":
      return "/icons/nim.svg";
    case ".zig":
      return "/icons/zig.svg";
    case ".nix":
      return "/icons/nix.svg";
    case ".tf":
    case ".tfvars":
      return "/icons/terraform.svg";
    case ".java":
      return "/icons/java.svg";
    case ".class":
      return "/icons/javaclass.svg";
    case ".jar":
      return "/icons/jar.svg";
    case ".swift":
      return "/icons/swift.svg";
    case ".kt":
    case ".kts":
      return "/icons/kotlin.svg";
    case ".scala":
    case ".sc":
      return "/icons/scala.svg";
    case ".php":
      return "/icons/php.svg";
    case ".rb":
    case ".erb":
      return "/icons/ruby.svg";
    case ".pl":
    case ".pm":
      return "/icons/perl.svg";
    case ".lua":
      return "/icons/lua.svg";
    case ".env":
      return "/icons/settings.svg";
    case ".glb":
    case ".gltf":
      return "/icons/3d.svg";
    default:
      return "/icons/document.svg";
  }
}

function getFolderIconPath(folderName: string): string {
  const name = folderName.toLowerCase();
  
  // Specific folder mappings based on known SVGs in public/icons
  if (name === "src" || name === "source" || name === "sources") return "/icons/folder-src.svg";
  if (name === "src-tauri") return "/icons/folder-src-tauri.svg";
  if (name === "app" || name === "apps") return "/icons/folder-app.svg";
  if (name === "config" || name === "configs" || name === "settings" || name === "options" || name === "configuration" || name === "configurations" || name === ".config") return "/icons/folder-config.svg";
  if (name === "images" || name === "image" || name === "img" || name === "pics" || name === "photos" || name === "pictures" || name === "icons" || name === "icon") return "/icons/folder-images.svg";
  if (name === "docs" || name === "doc" || name === "documentation") return "/icons/folder-docs.svg";
  if (name === "test" || name === "tests" || name === "spec" || name === "specs" || name === "__tests__" || name === "testing") return "/icons/folder-test.svg";
  if (name === "components" || name === "widgets") return "/icons/folder-components.svg";
  if (name === "api" || name === "apis" || name === "rest") return "/icons/folder-api.svg";
  if (name === "public" || name === "static" || name === "www") return "/icons/folder-public.svg";
  if (name === "assets" || name === "resources" || name === "res") return "/icons/folder-resource.svg";
  if (name === "styles" || name === "css" || name === "sass" || name === "scss" || name === "stylesheets") return "/icons/folder-css.svg";
  if (name === "utils" || name === "util" || name === "helpers" || name === "helper" || name === "tools") return "/icons/folder-utils.svg";
  if (name === "controllers" || name === "handlers") return "/icons/folder-controller.svg";
  if (name === "models" || name === "entities" || name === "classes" || name === "class") return "/icons/folder-class.svg";
  if (name === "routes" || name === "routing") return "/icons/folder-routes.svg";
  if (name === "scripts" || name === "bin" || name === "commands" || name === "cli") return "/icons/folder-scripts.svg";
  if (name === "database" || name === "db" || name === "sql" || name === "migrations" || name === "migration" || name === "seeders") return "/icons/folder-database.svg";
  if (name === "hooks") return "/icons/folder-hook.svg";
  if (name === "lib" || name === "libs" || name === "libraries" || name === "library") return "/icons/folder-lib.svg";
  if (name === "node_modules") return "/icons/folder-node.svg";
  if (name === "dist" || name === "out" || name === "build" || name === "target" || name === "release") return "/icons/folder-dist.svg";
  if (name === "packages" || name === "modules") return "/icons/folder-packages.svg";
  if (name === ".vscode" || name === "vscode") return "/icons/folder-vscode.svg";
  if (name === ".git" || name === "github" || name === ".github") return "/icons/folder-git.svg";
  if (name === "temp" || name === "tmp") return "/icons/folder-temp.svg";
  if (name === "i18n" || name === "locale" || name === "locales" || name === "translation" || name === "translations" || name === "g11n") return "/icons/folder-i18n.svg";
  if (name === "plugin" || name === "plugins" || name === "extension" || name === "extensions") return "/icons/folder-plugin.svg";
  if (name === "server" || name === "backend") return "/icons/folder-server.svg";
  if (name === "client" || name === "frontend") return "/icons/folder-client.svg";
  if (name === "shared" || name === "common") return "/icons/folder-shared.svg";
  if (name === "ui" || name === "views" || name === "view" || name === "layouts" || name === "layout") return "/icons/folder-ui.svg";
  if (name === "kubernetes" || name === "k8s" || name === "manifests") return "/icons/folder-kubernetes.svg";
  if (name === "docker" || name === ".docker") return "/icons/folder-docker.svg";
  if (name === "types" || name === "interfaces") return "/icons/folder-typescript.svg";
  if (name === "keys" || name === "certs" || name === "certificates" || name === "ssl") return "/icons/folder-keys.svg";
  if (name === "secure" || name === "security") return "/icons/folder-secure.svg";
  if (name === "markdown" || name === "md") return "/icons/folder-markdown.svg";
  if (name === "fonts" || name === "font") return "/icons/folder-font.svg";
  if (name === "logs" || name === "log") return "/icons/folder-log.svg";
  if (name === "workflows" || name === ".github/workflows") return "/icons/folder-gh-workflows.svg";
  if (name === "functions" || name === "func" || name === "funcs") return "/icons/folder-functions.svg";
  if (name === "theme" || name === "themes") return "/icons/folder-theme.svg";
  if (name === "tasks" || name === "task" || name === "jobs" || name === "job") return "/icons/folder-tasks.svg";
  if (name === "store" || name === "stores" || name === "redux") return "/icons/folder-store.svg";
  if (name === "json") return "/icons/folder-json.svg";
  if (name === "constants") return "/icons/folder-constant.svg";
  if (name === "middleware" || name === "middlewares") return "/icons/folder-middleware.svg";
  if (name === "admin" || name === "administrator") return "/icons/folder-admin.svg";
  if (name === "android") return "/icons/folder-android.svg";
  if (name === "angular") return "/icons/folder-angular.svg";
  if (name === "animation" || name === "animations") return "/icons/folder-animation.svg";
  if (name === "ansible") return "/icons/folder-admin.svg"; // fallback config
  if (name === "apollo") return "/icons/folder-apollo.svg";
  if (name === "archive" || name === "archives") return "/icons/folder-archive.svg";
  if (name === "assembly" || name === "asm") return "/icons/folder-assembly.svg";
  if (name === "astro") return "/icons/folder-astro.svg";
  if (name === "audio" || name === "audios" || name === "music" || name === "sound" || name === "sounds") return "/icons/folder-audio.svg";
  if (name === "aws" || name === "amazon") return "/icons/folder-aws.svg";
  if (name === "azure-pipelines") return "/icons/folder-azure-pipelines.svg";
  if (name === "backup" || name === "backups") return "/icons/folder-backup.svg";
  if (name === "benchmark" || name === "benchmarks") return "/icons/folder-benchmark.svg";
  if (name === "bibliography") return "/icons/folder-bibliography.svg";
  if (name === "bicep") return "/icons/folder-bicep.svg";
  if (name === "blender") return "/icons/folder-blender.svg";
  if (name === "bloc") return "/icons/folder-bloc.svg";
  if (name === "bower") return "/icons/folder-bower.svg";
  if (name === "buildkite") return "/icons/folder-buildkite.svg";
  if (name === "cart" || name === "shopping" || name === "ecommerce") return "/icons/folder-cart.svg";
  if (name === "changesets" || name === ".changesets" || name === ".changeset") return "/icons/folder-changesets.svg";
  if (name === "circleci") return "/icons/folder-circleci.svg";
  if (name === "claude") return "/icons/folder-claude.svg";
  if (name === "cline") return "/icons/folder-cline.svg";
  if (name === "cloud-functions") return "/icons/folder-cloud-functions.svg";
  if (name === "cloudflare") return "/icons/folder-cloudflare.svg";
  if (name === "cluster" || name === "clusters") return "/icons/folder-cluster.svg";
  if (name === "cobol") return "/icons/folder-cobol.svg";
  if (name === "connection" || name === "connections") return "/icons/folder-connection.svg";
  if (name === "console") return "/icons/folder-console.svg";
  if (name === "container" || name === "containers") return "/icons/folder-container.svg";
  if (name === "content" || name === "contents") return "/icons/folder-content.svg";
  if (name === "context" || name === "contexts") return "/icons/folder-context.svg";
  if (name === "contract" || name === "contracts") return "/icons/folder-contract.svg";
  if (name === "core") return "/icons/folder-core.svg";
  if (name === "coverage" || name === ".nyc_output") return "/icons/folder-coverage.svg";
  if (name === "cypress" || name === ".cypress") return "/icons/folder-cypress.svg";
  if (name === "dart") return "/icons/folder-dart.svg";
  if (name === "debug") return "/icons/folder-debug.svg";
  if (name === "decorators" || name === "decorator") return "/icons/folder-decorators.svg";
  if (name === "desktop") return "/icons/folder-desktop.svg";
  if (name === "directive" || name === "directives") return "/icons/folder-directive.svg";
  if (name === "download" || name === "downloads") return "/icons/folder-download.svg";
  if (name === "drizzle") return "/icons/folder-drizzle.svg";
  if (name === "dump" || name === "dumps") return "/icons/folder-dump.svg";
  if (name === "element" || name === "elements") return "/icons/folder-element.svg";
  if (name === "enum" || name === "enums") return "/icons/folder-enum.svg";
  if (name === "environment" || name === "environments" || name === "env" || name === "envs" || name === ".env") return "/icons/folder-environment.svg";
  if (name === "error" || name === "errors") return "/icons/folder-error.svg";
  if (name === "eslint" || name === ".eslint") return "/icons/folder-eslint.svg";
  if (name === "event" || name === "events") return "/icons/folder-event.svg";
  if (name === "example" || name === "examples" || name === "sample" || name === "samples") return "/icons/folder-examples.svg";
  if (name === "expo") return "/icons/folder-expo.svg";
  if (name === "export" || name === "exports") return "/icons/folder-export.svg";
  if (name === "fastlane") return "/icons/folder-fastlane.svg";
  if (name === "favicon" || name === "favicons") return "/icons/folder-favicon.svg";
  if (name === "features" || name === "feature") return "/icons/folder-features.svg";
  if (name === "filter" || name === "filters") return "/icons/folder-filter.svg";
  if (name === "firebase") return "/icons/folder-firebase.svg";
  if (name === "firestore") return "/icons/folder-firestore.svg";
  if (name === "flow") return "/icons/folder-flow.svg";
  if (name === "flutter") return "/icons/folder-flutter.svg";
  if (name === "forgejo") return "/icons/folder-forgejo.svg";
  if (name === "forms" || name === "form") return "/icons/folder-form.svg";
  if (name === "gamemaker") return "/icons/folder-gamemaker.svg";
  if (name === "gemini-ai" || name === "gemini") return "/icons/folder-gemini-ai.svg";
  if (name === "generator" || name === "generators") return "/icons/folder-generator.svg";
  if (name === "gitea") return "/icons/folder-gitea.svg";
  if (name === "gitlab" || name === ".gitlab") return "/icons/folder-gitlab.svg";
  if (name === "global" || name === "globals") return "/icons/folder-global.svg";
  if (name === "go" || name === "golang") return "/icons/folder-go.svg";
  if (name === "godot") return "/icons/folder-godot.svg";
  if (name === "gradle" || name === ".gradle") return "/icons/folder-gradle.svg";
  if (name === "graphql") return "/icons/folder-graphql.svg";
  if (name === "guard") return "/icons/folder-guard.svg";
  if (name === "gulp") return "/icons/folder-gulp.svg";
  if (name === "helm") return "/icons/folder-helm.svg";
  if (name === "home") return "/icons/folder-home.svg";
  if (name === "husky" || name === ".husky") return "/icons/folder-husky.svg";
  if (name === "import" || name === "imports") return "/icons/folder-import.svg";
  if (name === "include" || name === "includes" || name === "inc") return "/icons/folder-include.svg";
  if (name === "input" || name === "inputs") return "/icons/folder-input.svg";
  if (name === ".idea") return "/icons/folder-intellij.svg";
  if (name === "interceptor" || name === "interceptors") return "/icons/folder-interceptor.svg";
  if (name === "ios") return "/icons/folder-ios.svg";
  if (name === "java") return "/icons/folder-java.svg";
  if (name === "javascript" || name === "js") return "/icons/folder-javascript.svg";
  if (name === "jinja") return "/icons/folder-jinja.svg";
  if (name === "json") return "/icons/folder-json.svg";
  if (name === "jupyter" || name === ".ipynb_checkpoints") return "/icons/folder-jupyter.svg";
  if (name === "kotlin") return "/icons/folder-kotlin.svg";
  if (name === "kusto") return "/icons/folder-kusto.svg";
  if (name === "lefthook") return "/icons/folder-lefthook.svg";
  if (name === "less") return "/icons/folder-less.svg";
  if (name === "license" || name === "licenses") return "/icons/folder-license.svg";
  if (name === "link" || name === "links") return "/icons/folder-link.svg";
  if (name === "linux") return "/icons/folder-linux.svg";
  if (name === "liquibase") return "/icons/folder-liquibase.svg";
  if (name === "lottie") return "/icons/folder-lottie.svg";
  if (name === "lua") return "/icons/folder-lua.svg";
  if (name === "luau") return "/icons/folder-luau.svg";
  if (name === "macos" || name === "osx") return "/icons/folder-macos.svg";
  if (name === "mail" || name === "mails" || name === "email" || name === "emails") return "/icons/folder-mail.svg";
  if (name === "mappings" || name === "mapping") return "/icons/folder-mappings.svg";
  if (name === "hg" || name === ".hg") return "/icons/folder-mercurial.svg";
  if (name === "messages" || name === "messaging") return "/icons/folder-messages.svg";
  if (name === "meta") return "/icons/folder-meta.svg";
  if (name === "metro") return "/icons/folder-metro.svg";
  if (name === "mojo") return "/icons/folder-mojo.svg";
  if (name === "molecule") return "/icons/folder-molecule.svg";
  if (name === "moon") return "/icons/folder-moon.svg";
  if (name === "netlify" || name === ".netlify") return "/icons/folder-netlify.svg";
  if (name === "next" || name === ".next") return "/icons/folder-next.svg";
  if (name === "nginx") return "/icons/folder-nginx.svg";
  if (name === "ngrx") return "/icons/folder-ngrx-store.svg";
  if (name === "node") return "/icons/folder-node.svg";
  if (name === "nuxt" || name === ".nuxt") return "/icons/folder-nuxt.svg";
  if (name === "obsidian" || name === ".obsidian") return "/icons/folder-obsidian.svg";
  if (name === "opencode") return "/icons/folder-opencode.svg";
  if (name === "organism" || name === "organisms") return "/icons/folder-organism.svg";
  if (name === "pdf") return "/icons/folder-pdf.svg";
  if (name === "pdm") return "/icons/folder-pdm.svg";
  if (name === "php") return "/icons/folder-php.svg";
  if (name === "phpmailer") return "/icons/folder-phpmailer.svg";
  if (name === "pipe" || name === "pipes") return "/icons/folder-pipe.svg";
  if (name === "plastic") return "/icons/folder-plastic.svg";
  if (name === "policy" || name === "policies") return "/icons/folder-policy.svg";
  if (name === "postman" || name === ".postman") return "/icons/folder-postman.svg";
  if (name === "powershell" || name === "ps") return "/icons/folder-powershell.svg";
  if (name === "prisma") return "/icons/folder-prisma.svg";
  if (name === "private") return "/icons/folder-private.svg";
  if (name === "project" || name === "projects") return "/icons/folder-project.svg";
  if (name === "prompts") return "/icons/folder-prompts.svg";
  if (name === "proto" || name === "protobuf") return "/icons/folder-proto.svg";
  if (name === "python" || name === "py" || name === "__pycache__") return "/icons/folder-python.svg";
  if (name === "pytorch") return "/icons/folder-pytorch.svg";
  if (name === "quasar") return "/icons/folder-quasar.svg";
  if (name === "queue" || name === "queues") return "/icons/folder-queue.svg";
  if (name === "r") return "/icons/folder-r.svg";
  if (name === "react") return "/icons/folder-react-components.svg";
  if (name === "repository" || name === "repositories" || name === "repo" || name === "repos") return "/icons/folder-repository.svg";
  if (name === "resolver" || name === "resolvers") return "/icons/folder-resolver.svg";
  if (name === "review" || name === "reviews") return "/icons/folder-review.svg";
  if (name === "robot") return "/icons/folder-robot.svg";
  if (name === "rules") return "/icons/folder-rules.svg";
  if (name === "rust" || name === "cargo") return "/icons/folder-rust.svg";
  if (name === "salt") return "/icons/folder-salt.svg";
  if (name === "sandbox" || name === "sandboxes") return "/icons/folder-sandbox.svg";
  if (name === "scala") return "/icons/folder-scala.svg";
  if (name === "scons") return "/icons/folder-scons.svg";
  if (name === "simulations" || name === "simulation") return "/icons/folder-simulations.svg";
  if (name === "snapcraft") return "/icons/folder-snapcraft.svg";
  if (name === "snippet" || name === "snippets") return "/icons/folder-snippet.svg";
  if (name === "stack") return "/icons/folder-stack.svg";
  if (name === "stencil") return "/icons/folder-stencil.svg";
  if (name === "storybook" || name === ".storybook") return "/icons/folder-storybook.svg";
  if (name === "stylus") return "/icons/folder-stylus.svg";
  if (name === "sublime") return "/icons/folder-sublime.svg";
  if (name === "supabase") return "/icons/folder-supabase.svg";
  if (name === "svelte" || name === ".svelte-kit") return "/icons/folder-svelte.svg";
  if (name === "svg" || name === "svgs") return "/icons/folder-svg.svg";
  if (name === "syntax") return "/icons/folder-syntax.svg";
  if (name === "target") return "/icons/folder-target.svg";
  if (name === "taskfile") return "/icons/folder-taskfile.svg";
  if (name === "tv" || name === "television") return "/icons/folder-television.svg";
  if (name === "template" || name === "templates") return "/icons/folder-template.svg";
  if (name === "terraform") return "/icons/folder-terraform.svg";
  if (name === "turborepo") return "/icons/folder-turborepo.svg";
  if (name === "typescript" || name === "ts") return "/icons/folder-typescript.svg";
  if (name === "unity") return "/icons/folder-unity.svg";
  if (name === "update" || name === "updates") return "/icons/folder-update.svg";
  if (name === "upload" || name === "uploads") return "/icons/folder-upload.svg";
  if (name === "vercel" || name === ".vercel") return "/icons/folder-vercel.svg";
  if (name === "verdaccio") return "/icons/folder-verdaccio.svg";
  if (name === "video" || name === "videos" || name === "movies") return "/icons/folder-video.svg";
  if (name === "vm") return "/icons/folder-vm.svg";
  if (name === "wakatime") return "/icons/folder-wakatime.svg";
  if (name === "webpack") return "/icons/folder-webpack.svg";
  if (name === "windows") return "/icons/folder-windows.svg";
  if (name === "wordpress") return "/icons/folder-wordpress.svg";
  if (name === "yarn" || name === ".yarn") return "/icons/folder-yarn.svg";
  if (name === "zeabur") return "/icons/folder-zeabur.svg";
  if (name === "zed") return "/icons/folder-zed.svg";

  // Generic folder icon fallback
  return "/icons/folder-other.svg";
}

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
  contextCabinetPath?: string | null;
  siblings?: TreeNodeType[];
  onMoveToRequest?: (node: TreeNodeType) => void;
  /**
   * Optional stagger delay (ms) applied as a fade-in animation when the row
   * mounts. Set by the parent so the whole tree cascades in like a drawer
   * being pulled out. Propagates to children with an extra bump so nested
   * rows appear after their parent.
   */
  animationDelayMs?: number;
}

const ANIMATION_MAX_DELAY_MS = 360;
const ANIMATION_CHILD_BASE_BUMP_MS = 30;
const ANIMATION_CHILD_SIBLING_MS = 14;

// Google embed pages are markdown pages with `google:` frontmatter, so they'd
// otherwise show the generic page icon. Give them a kind-matching icon (doc /
// sheet / slides, same family as the local Office icons) with a small "g"
// badge so they read as Google at a glance.
function TreeNodeImpl({
  node,
  depth,
  contextCabinetPath = null,
  siblings,
  onMoveToRequest,
  animationDelayMs,
}: TreeNodeProps) {
  const { t } = useLocale();
  const hasChildren = !!(node.children && node.children.length > 0);
  // Narrow store subscriptions: each row re-renders only when *its own*
  // selected / drag-over / moving / expanded state changes — not on every
  // drag-over tick across the whole tree (the source of the reported jank).
  const isSelected = useTreeStore((s) => s.selectedPath === node.path);
  const isDragOver = useTreeStore((s) => s.dragOverPath === node.path);
  const dragOverZone = useTreeStore((s) =>
    s.dragOverPath === node.path ? s.dragOverZone : null
  );
  const isMoving = useTreeStore((s) => s.movingPaths.has(node.path));
  const isExpanded = useTreeStore(
    (s) => hasChildren && s.expandedPaths.has(node.path)
  );
  const focusTick = useTreeStore((s) => s.focusTick);
  const isChanged = useTreeStore((s) => s.recentlyChanged.has(node.path));
  const toggleExpand = useTreeStore((s) => s.toggleExpand);
  const expandPath = useTreeStore((s) => s.expandPath);
  const selectPage = useTreeStore((s) => s.selectPage);
  const deletePage = useTreeStore((s) => s.deletePage);
  const movePage = useTreeStore((s) => s.movePage);
  const setDragOver = useTreeStore((s) => s.setDragOver);
  const createPage = useTreeStore((s) => s.createPage);
  const renamePage = useTreeStore((s) => s.renamePage);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [blink, setBlink] = useState(false);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const loadPage = useEditorStore((s) => s.loadPage);
  const setSection = useAppStore((s) => s.setSection);
  const appMode = useAppStore((s) => s.appMode);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const [subPageOpen, setSubPageOpen] = useState(false);
  const [subPageTitle, setSubPageTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);
  const [connectKnowledgeOpen, setConnectKnowledgeOpen] = useState(false);
  const [githubConnectOpen, setGithubConnectOpen] = useState(false);
  const [notionConnectOpen, setNotionConnectOpen] = useState(false);
  const [appleNotesConnectOpen, setAppleNotesConnectOpen] = useState(false);
  const [connectDriveOpen, setConnectDriveOpen] = useState(false);
  const [driveProvider, setDriveProvider] = useState<KnowledgeProviderId>("google-drive");
  // Inline Connect Knowledge mount metadata (set by the tree-builder).
  const isReadOnly = node.knowledgePolicy === "read-only";
  const knowledgeLogo = node.knowledgeProvider
    ? providerLogo(node.knowledgeProvider)
    : undefined;
  const [createCabinetOpen, setCreateCabinetOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [editSymlinkOpen, setEditSymlinkOpen] = useState(false);
  const [fileSettingsOpen, setFileSettingsOpen] = useState(false);

  const title = node.frontmatter?.title || node.name;
  // Typed files that carry editable settings (Google embeds, web apps/sites).
  const hasFileSettings =
    !!node.frontmatter?.google ||
    node.type === "app" ||
    node.type === "website";

  const isMac = useMemo(isMacPlatform, []);
  // Hints shown on the right of the context-menu rows. Move-to is handled
  // app-wide in tree-view.tsx (Cmd+Shift+M); rename/delete are wired on the
  // selected row by the effect below. Delete is Cmd+Backspace on macOS
  // (Finder convention) so a stray Backspace can't nuke a page; plain Del
  // elsewhere.
  const renameShortcut = formatShortcut(["f2"], isMac);
  const moveShortcut = formatShortcut(["cmd", "shift", "m"], isMac);
  const deleteShortcut = formatShortcut(
    isMac ? ["cmd", "backspace"] : ["del"],
    isMac
  );
  const copyRelShortcut = formatShortcut(
    isMac ? ["alt", "cmd", "C"] : ["ctrl", "alt", "C"],
    isMac
  );
  const copyFullShortcut = formatShortcut(
    isMac ? ["shift", "alt", "cmd", "C"] : ["ctrl", "shift", "alt", "C"],
    isMac
  );
  const finderShortcut = formatShortcut(["cmd", "enter"], isMac);

  // Shared action bodies — referenced by both the context menu and the
  // selected-row keyboard shortcuts so the two stay in lockstep.
  const doCopyRelative = useCallback(() => {
    // For Drive nodes the virtual path is meaningless to the user — copy the
    // filename instead (same as what "Copy Full Path" gives minus the directory).
    const driveAbsPath = decodeDrivePath(node.path);
    if (driveAbsPath !== null) {
      void navigator.clipboard.writeText(driveAbsPath.split(/[/\\]/).pop() ?? driveAbsPath);
      return;
    }
    void navigator.clipboard.writeText(node.path);
  }, [node.path]);

  const doCopyFull = useCallback(async () => {
    // Drive nodes encode the absolute path directly — decode it instead of
    // prepending the local data directory.
    const driveAbsPath = decodeDrivePath(node.path);
    if (driveAbsPath !== null) {
      void navigator.clipboard.writeText(driveAbsPath);
      return;
    }
    const dir = await getDataDir();
    void navigator.clipboard.writeText(`${dir}/${node.path}`);
  }, [node.path]);

  const doOpenInFinder = useCallback(() => {
    // Drive nodes: reveal via the Drive-specific route which validates against
    // mounts and uses the correct reveal command per platform
    // (open -R on macOS, explorer /select, on Windows, xdg-open parent on Linux).
    if (decodeDrivePath(node.path) !== null) {
      void fetch("/api/google-drive/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: node.path }),
      });
      return;
    }
    void fetch("/api/system/open-data-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subpath: node.path }),
    });
  }, [node.path]);

  // Right-click "Download" submenu shares the editor toolbar's export actions.
  // Markdown pages (type file/directory/cabinet, or a `.md` path) fetch their
  // saved content and transform it; any other file downloads raw.
  const isMarkdownExport =
    node.type === "file" ||
    node.type === "directory" ||
    node.type === "cabinet" ||
    node.path.toLowerCase().endsWith(".md");

  const runExport = useCallback(
    async (action: (content: string) => void | Promise<void>) => {
      try {
        const res = await fetch(contentUrlFor(node.path, node.type));
        if (!res.ok) throw new Error(`status ${res.status}`);
        await action(await res.text());
      } catch {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: {
              kind: "error",
              message: "Couldn't load this file to export.",
            },
          })
        );
      }
    },
    [node.path, node.type]
  );

  useEffect(() => {
    if (!isSelected || focusTick === 0) return;
    const el = rowRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 1400);
    return () => clearTimeout(t);
  }, [isSelected, focusTick]);

  // File-explorer keys for the selected row: F2 → rename, Cmd+Backspace
  // (macOS) / Del → delete. Gated on isSelected so exactly one row's
  // listener is ever live, no matter how large the tree is. Mirrors the
  // existing context-menu actions (opens the same dialogs) rather than
  // mutating directly, so the confirm step is preserved.
  useEffect(() => {
    if (!isSelected || isMoving) return;
    const anyDialogOpen =
      subPageOpen ||
      newFolderOpen ||
      renameOpen ||
      deleteOpen ||
      linkRepoOpen ||
      createCabinetOpen ||
      newFileOpen ||
      editSymlinkOpen ||
      fileSettingsOpen;
    const onKey = (e: KeyboardEvent) => {
      if (anyDialogOpen || isEditableTarget(e.target)) return;
      // F2 → rename, or Edit Symlink for linked ("knowledge") nodes.
      if (e.key === "F2") {
        e.preventDefault();
        if (node.isLinked) {
          setEditSymlinkOpen(true);
        } else if (!isReadOnly) {
          setRenameTitle(title);
          setRenameOpen(true);
        }
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      // Letter shortcuts key off e.code — macOS Option remaps e.key
      // (Option+C → "ç"), so the physical KeyC is the reliable signal.
      if (mod && e.altKey && e.code === "KeyC") {
        e.preventDefault();
        if (e.shiftKey) void doCopyFull();
        else doCopyRelative();
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && e.code === "Enter") {
        e.preventDefault();
        doOpenInFinder();
        return;
      }
      const isDelete = isMac
        ? e.metaKey && (e.key === "Backspace" || e.key === "Delete")
        : e.key === "Delete" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (isDelete) {
        e.preventDefault();
        // Read-only mount contents can't be deleted; the mount node itself
        // (a symlink) can still be disconnected.
        if (isReadOnly && !node.isLinked) return;
        setDeleteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isSelected,
    isMoving,
    isMac,
    title,
    node.isLinked,
    isReadOnly,
    subPageOpen,
    newFolderOpen,
    renameOpen,
    deleteOpen,
    linkRepoOpen,
    createCabinetOpen,
    newFileOpen,
    editSymlinkOpen,
    fileSettingsOpen,
    doCopyFull,
    doCopyRelative,
    doOpenInFinder,
  ]);

  // Open a lone .html file in the chosen mode (rendered webpage vs. source).
  // Persists the preference so re-opening keeps it, and updates an already-open
  // viewer live via the html-view-mode event.
  const openHtmlAs = (m: HtmlViewMode) => {
    setHtmlViewMode(node.path, m);
    selectPage(node.path);
    void loadPage(node.path);
  };

  const handleClick = () => {
    selectPage(node.path);
    // Cabinets used to switch the entire app to the cabinet view on row
    // click — that trapped users who just wanted to browse files inside.
    // Now they behave like any folder: load the cabinet's index page and
    // expand the subtree. The "Open cabinet" pill on hover (rendered below)
    // is the explicit affordance for switching into the cabinet view.
    if (node.type === "file" || node.type === "directory" || node.type === "cabinet") {
      loadPage(node.path);
    }

    // While browsing, clicking a tree row keeps you in browse mode and loads
    // that file's in-app browser URL rather than dropping back to the editor.
    const assetUrl = `/api/assets/${node.path.split("/").map(encodeURIComponent).join("/")}`;
    const browseFileUrl =
      node.type === "website" || node.type === "app"
        ? `${assetUrl}/index.html`
        : node.type === "drawio"
          ? `${window.location.origin}/drawio/editor.html?path=${node.path}`
          : node.type === "excalidraw"
            ? `${window.location.origin}/excalidraw/editor?path=${node.path}`
            : // Sibling Pattern: a `<name>.md` page can carry sub-pages and so be
              // typed "directory", but its content still lives at `<name>.md`, not
              // an `index.md` inside the folder — match the markdown name first.
              // Markdown pages are typed "file" with the extension stripped from
              // the path, so they also resolve to `<name>.md`.
              (node.type === "file" && !isHtmlPath(node.path)) || node.name.toLowerCase().endsWith(".md")
              ? `${assetUrl}.md`
              : node.type === "directory" || node.type === "cabinet"
                ? `${assetUrl}/index.md`
                : assetUrl;

    if (appMode === "browse") {
      setAppMode("browse", browseFileUrl);
    }

    setSection(
      contextCabinetPath
        ? {
            type: "page",
            cabinetPath: contextCabinetPath,
          }
        : { type: "page" }
    );
  };

  const handleOpenCabinet = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Switch *into* the cabinet (sidebar drawer shows Data/Agents/Tasks tabs
    // because section.cabinetPath is set) and land on the cabinet's data
    // page — the index.md — instead of the dashboard. The dashboard is one
    // click away via the top of the cabinet drawer if the user wants it.
    selectPage(node.path);
    void loadPage(node.path);
    setSection({
      type: "page",
      cabinetPath: node.path,
    });
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const handleCreateSubPage = async () => {
    if (!subPageTitle.trim()) return;
    setCreating(true);
    try {
      await createPage(node.path, subPageTitle.trim());
      const slug = subPageTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const nextPath = `${node.path}/${slug}`;
      selectPage(nextPath);
      loadPage(nextPath);
      setSection(
        contextCabinetPath
          ? {
              type: "page",
              cabinetPath: contextCabinetPath,
            }
          : { type: "page" }
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cabinet:open-editor-chat", {
            detail: { pagePath: nextPath, fileName: subPageTitle.trim() },
          })
        );
      }
      setSubPageTitle("");
      setSubPageOpen(false);
    } catch (error) {
      console.error("Failed to create sub page:", error);
    } finally {
      setCreating(false);
    }
  };

  // A "folder" here is just a page used as a container — same on-disk shape
  // as Add Sub Page (dir + index.md), so it can still hold content if the
  // user wants. The difference is intent: we don't drop them into the
  // editor. We expand the new node in the tree so it's immediately ready
  // to receive children. It picks up the folder icon automatically once it
  // has any (see hasChildren branch in the row render).
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createPage(node.path, newFolderName.trim());
      const slug = newFolderName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const nextPath = `${node.path}/${slug}`;
      expandPath(node.path);
      expandPath(nextPath);
      selectPage(nextPath);
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setCreatingFolder(false);
    }
  };

  const isContainer =
    node.type === "directory" || node.type === "cabinet";

  const isDirLike =
    isContainer || node.type === "app" || node.type === "website";

  const importTargetPath = isDirLike
    ? node.path
    : node.path.split("/").slice(0, -1).join("/");

  const {
    importFiles,
    importFilesList,
    importing,
    importFolder,
    importingFolder,
  } = useFileImport();

  const computeZone = useCallback(
    (e: React.DragEvent): "before" | "into" | "after" => {
      const el = rowRef.current;
      if (!el) return "into";
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const h = rect.height;
      if (isContainer) {
        if (y < h * 0.25) return "before";
        if (y > h * 0.75) return "after";
        return "into";
      }
      return y < h * 0.5 ? "before" : "after";
    },
    [isContainer]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", node.path);
      e.dataTransfer.effectAllowed = "move";

      const source = rowRef.current;
      if (source) {
        const ghost = source.cloneNode(true) as HTMLDivElement;
        ghost.style.position = "fixed";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.style.borderRadius = "8px";
        ghost.style.background = "var(--popover)";
        ghost.style.color = "var(--popover-foreground)";
        ghost.style.boxShadow =
          "0 8px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.04) inset";
        ghost.style.border = "1px solid var(--border)";
        ghost.style.padding = "4px 8px";
        ghost.style.opacity = "0.95";
        ghost.style.pointerEvents = "none";
        ghost.style.transform = "translateZ(0)";
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
        e.dataTransfer.setDragImage(ghost, 12, 12);
      }
    },
    [node.path]
  );

  const handleDragEnd = useCallback(() => {
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isFileDrag = e.dataTransfer.types.includes("Files");
      if (isFileDrag) {
        e.dataTransfer.dropEffect = "copy";
        if (!isDragOver || dragOverZone !== "into") {
          setDragOver(node.path, "into");
        }
        return;
      }
      e.dataTransfer.dropEffect = "move";
      const zone = computeZone(e);
      if (!isDragOver || dragOverZone !== zone) {
        setDragOver(node.path, zone);
      }
    },
    [node.path, setDragOver, computeZone, isDragOver, dragOverZone]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDragOver) {
        setDragOver(null);
      }
    },
    [isDragOver, setDragOver]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zone = computeZone(e);
      setDragOver(null);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void importFilesList(importTargetPath, e.dataTransfer.files);
        return;
      }

      const fromPath = e.dataTransfer.getData("text/plain");
      if (!fromPath || fromPath === node.path) return;

      // Don't drop a page into one of its own descendants (would be circular).
      // The previous direction blocked dropping a child onto its parent's
      // before/after zone — a legitimate way to reach the top level.
      if (node.path.startsWith(fromPath + "/")) return;

      const nodeParent = node.path.split("/").slice(0, -1).join("/");

      if (zone === "into") {
        if (!isContainer) return;
        if (fromPath === node.path) return;
        movePage(fromPath, node.path);
        return;
      }

      // before/after → reorder within node's parent
      const targetParent = nodeParent;
      if (!siblings) {
        movePage(fromPath, targetParent);
        return;
      }
      const visible = siblings.filter((s) => s.path !== fromPath);
      const targetIndexInVisible = visible.findIndex((s) => s.path === node.path);
      if (targetIndexInVisible === -1) {
        movePage(fromPath, targetParent);
        return;
      }
      const insertIndex =
        zone === "before" ? targetIndexInVisible : targetIndexInVisible + 1;
      const prev = insertIndex > 0 ? visible[insertIndex - 1] : null;
      const next =
        insertIndex < visible.length ? visible[insertIndex] : null;
      const prevName = prev ? prev.path.split("/").pop() || null : null;
      const nextName = next ? next.path.split("/").pop() || null : null;
      movePage(fromPath, targetParent, { prevName, nextName });
    },
    [
      node.path,
      isContainer,
      movePage,
      setDragOver,
      computeZone,
      siblings,
      importFilesList,
      importTargetPath,
    ]
  );

  const showInsertBefore = isDragOver && dragOverZone === "before";
  const showInsertAfter = isDragOver && dragOverZone === "after";
  const showInto = isDragOver && dragOverZone === "into";

  const hasAnimation = typeof animationDelayMs === "number";
  const animationStyle: React.CSSProperties | undefined = hasAnimation
    ? {
        animationDelay: `${Math.min(animationDelayMs!, ANIMATION_MAX_DELAY_MS)}ms`,
        animationFillMode: "backwards",
      }
    : undefined;

  return (
    <>
      <div
        className={cn(
          "relative",
          hasAnimation &&
            "animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
        )}
        style={animationStyle}
      >
      {showInsertBefore && (
        <div
          className="pointer-events-none absolute -top-px inset-e-1.5 z-10 h-0.5 rounded-full bg-primary"
          style={{ insetInlineStart: `${depth * 16 + 8}px` }}
        />
      )}
      {showInsertAfter && (
        <div
          className="pointer-events-none absolute -bottom-px inset-e-1.5 z-10 h-0.5 rounded-full bg-primary"
          style={{ insetInlineStart: `${depth * 16 + 8}px` }}
        />
      )}
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            ref={rowRef}
            draggable={!isMoving}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "group relative flex items-center gap-2 w-full text-start py-1 px-2 text-[12px] text-foreground/75 rounded-md transition-colors",
              // Audit #048: link-like pointer at rest; grab only while the row is
              // actively pressed/dragged. A resting grab cursor mislabels a
              // click-to-open row as a drag handle.
              "hover:bg-foreground/[0.03] hover:text-foreground cursor-pointer active:cursor-grabbing",
              // Override the ContextMenuTrigger wrapper's user-select:none so HTML5 dragstart fires on first mousedown (Chromium quirk: draggable rows inheriting user-select:none need a focus pass before drag initiates).
              "select-text",
              // Audit #015: active row needs two cues, not just background.
              // Adds a 2px primary-color accent bar on the start edge via a
              // before:: pseudo (does not fight the row's existing padding)
              // and bumps the label weight to font-semibold. Row background
              // stays subtle so hover (no bar, no weight) reads as lighter.
              // Uses logical start/rounded-e so the bar flips to the
              // right edge in RTL and stays rounded on its inner side.
              isSelected &&
                "bg-accent/70 text-accent-foreground font-semibold before:absolute before:inset-s-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-e-full before:bg-primary",
              // Recently created/changed by a task — subtle tint + an
              // unread-style bump to fuller, medium-weight text until opened.
              isChanged && !isSelected &&
                "bg-emerald-500/6 font-medium text-foreground before:absolute before:inset-s-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-e-full before:bg-emerald-500/70",
              showInto &&
                "bg-primary/10 ring-1 ring-primary/30 ring-inset",
              blink && "cabinet-tree-blink",
              isMoving && "opacity-60 cursor-progress! pointer-events-none"
            )}
            style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
          >
            {/* Audit #046: expand/select/open are sibling controls inside this
                non-interactive row container, not controls nested in a button. */}
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.path);
                }}
                // Audit #047: keep the 12px glyph but expand the clickable box to
                // ~24px via a negative-inset ::before overlay, so the target meets
                // WCAG 2.5.8 without shifting the row's indent.
                className="relative shrink-0 -ms-1 flex items-center justify-center w-3 h-3 rounded hover:bg-accent before:absolute before:-inset-1.5 before:content-['']"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 text-muted-foreground/70 transition-transform duration-150",
                    isExpanded ? "rotate-90" : "rtl:rotate-180"
                  )}
                />
              </button>
            ) : (
              <span className="w-3 -ms-1 shrink-0" />
            )}
            <button
              type="button"
              onClick={handleClick}
              disabled={isMoving}
              className="flex min-w-0 flex-1 items-center gap-2 text-start"
            >
            {knowledgeLogo ? (
              // Inline Connect Knowledge mount → provider brand mark.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={knowledgeLogo} alt="" className="h-3.5 w-3.5 shrink-0" />
            ) : node.knowledgeProvider ? (
              // Mount whose provider has no brand asset (e.g. iCloud).
              <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            ) : node.frontmatter?.google ? (
              <GoogleNodeIcon kind={node.frontmatter.google.kind} />
            ) : node.type === "cabinet" ? (
              // Audit #016 (review feedback 2026-05-02): keep the Archive
              // icon — it's the brand glyph used by the sidebar header and
              // the rest of the app. Persistent amber-400 color so cabinet
              // rows read consistently across the tree, sidebar header,
              // and any breadcrumb references.
              <Archive className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : node.hasRepo ? (
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            ) : node.isLinked ? (
              <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            ) : hasChildren || node.type === "directory" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getFolderIconPath(node.name)}
                alt=""
                className="h-3.5 w-3.5 shrink-0 animate-in fade-in duration-200"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getFileIconPath(node.name)}
                alt=""
                className="h-3.5 w-3.5 shrink-0 animate-in fade-in duration-200"
              />
            )}
            <span
              className={cn(
                "truncate",
                node.type === "unknown" && "opacity-50",
                // Audit #016: bump cabinet rows to medium weight so the eye
                // can scan "places vs. things" without reading the icon.
                node.type === "cabinet" && "font-medium"
              )}
            >
              {title}
            </span>
            {node.knowledgeProvider && isReadOnly && (
              <span
                className="ms-1 shrink-0 rounded bg-foreground/[0.05] px-1 py-px font-mono text-[9px] font-medium text-muted-foreground/60"
                title="Read-only — connected for viewing"
              >
                view
              </span>
            )}
            </button>
            {isChanged && !isMoving && node.type !== "cabinet" && (
              <span
                className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                aria-label="New or changed"
                title="New or changed"
              />
            )}
            {isMoving && (
              <Loader2 className="ms-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
            {node.type === "cabinet" && !isMoving && (
              // Audit #016 (review feedback 2026-05-02 round 2):
              // Hover-revealed "Open" pill — at rest the cabinet row has
              // no extra chrome (the Archive icon already says "cabinet").
              // On row hover the pill fades in as the explicit "switch
              // into the cabinet's scoped view" affordance. Audit #046: now a
              // real <button> sibling of the row's action button, not a
              // role="button" span nested inside it.
              <button
                type="button"
                aria-label={`Open cabinet ${title}`}
                title={t("treeNode:openCabinet")}
                onClick={handleOpenCabinet}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "ms-auto shrink-0 rounded-md bg-foreground/4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80 transition-[opacity,background-color,color]",
                  "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                )}
              >
                {t("treeNode:openBadge")}
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          <ContextMenuGroup>
            <ContextMenuLabel className="font-normal text-muted-foreground/50">{t("treeNode:sectionAdd")}</ContextMenuLabel>
            <ContextMenuItem disabled={isReadOnly} onClick={() => setSubPageOpen(true)}>
              <FilePlus className="h-4 w-4 me-2" />
              {t("treeNode:addSubPage")}
            </ContextMenuItem>
            <ContextMenuItem disabled={isReadOnly} onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4 me-2" />
              {t("treeNode:newFolder")}
            </ContextMenuItem>
            <ContextMenuItem disabled={isReadOnly} onClick={() => setNewFileOpen(true)}>
              <FilePlus2 className="h-4 w-4 me-2" />
              {t("treeNode:createFile")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={importing || isReadOnly}
              onClick={() => importFiles(importTargetPath)}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 me-2" />
              )}
              {t("treeNode:importFile")}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={importingFolder || isReadOnly}
              onClick={() => importFolder(importTargetPath)}
            >
              {importingFolder ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4 me-2" />
              )}
              {t("treeNode:importFolder")}
            </ContextMenuItem>
            <ContextMenuItem disabled={isReadOnly} onClick={() => setConnectKnowledgeOpen(true)}>
              <GitBranch className="h-4 w-4 me-2" />
              {t("treeNode:connectKnowledge")}
            </ContextMenuItem>
            <ContextMenuItem disabled={isReadOnly} onClick={() => setCreateCabinetOpen(true)}>
              <Archive className="h-4 w-4 me-2" />
              {t("treeNode:createCabinet")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel className="font-normal text-muted-foreground/50">{t("treeNode:sectionThis")}</ContextMenuLabel>
            {node.isLinked ? (
              <ContextMenuItem onClick={() => setEditSymlinkOpen(true)}>
                <Link2 className="h-4 w-4 me-2" />
                {t("treeNode:editSymlink")}
                <ContextMenuShortcut>{renameShortcut}</ContextMenuShortcut>
              </ContextMenuItem>
            ) : (
              <ContextMenuItem disabled={isReadOnly} onClick={() => { setRenameTitle(title); setRenameOpen(true); }}>
                <Pencil className="h-4 w-4 me-2" />
                {t("treeNode:rename")}
                <ContextMenuShortcut>{renameShortcut}</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {isHtmlPath(node.path) && (
              // Lone HTML files: let the user choose how to open them — as a
              // rendered webpage (the default) or as raw source. The viewer
              // also carries a Preview/Source toggle.
              <>
                <ContextMenuItem onClick={() => openHtmlAs("preview")}>
                  <Eye className="h-4 w-4 me-2" />
                  Open as webpage
                </ContextMenuItem>
                <ContextMenuItem onClick={() => openHtmlAs("source")}>
                  <Code2 className="h-4 w-4 me-2" />
                  Open as source
                </ContextMenuItem>
              </>
            )}
            {hasFileSettings && (
              <ContextMenuItem onClick={() => setFileSettingsOpen(true)}>
                <Settings2 className="h-4 w-4 me-2" />
                {t("treeNode:settings")}
              </ContextMenuItem>
            )}
            {onMoveToRequest && (
              <ContextMenuItem disabled={isReadOnly} onClick={() => onMoveToRequest(node)}>
                <ArrowRightLeft className="h-4 w-4 me-2" />
                {t("treeNode:moveTo")}
                <ContextMenuShortcut>{moveShortcut}</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={doCopyRelative}>
              <Copy className="h-4 w-4 me-2" />
              {t("treeNode:copyRelativePath")}
              <ContextMenuShortcut>{copyRelShortcut}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void doCopyFull()}>
              <ClipboardCopy className="h-4 w-4 me-2" />
              {t("treeNode:copyFullPath")}
              <ContextMenuShortcut>{copyFullShortcut}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={doOpenInFinder}>
              <FolderOpen className="h-4 w-4 me-2" />
              {t("treeNode:openInFinder")}
              <ContextMenuShortcut>{finderShortcut}</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Download className="h-4 w-4 me-2" />
                Download
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-52">
                {isMarkdownExport ? (
                  <>
                    <ContextMenuItem onClick={() => void runExport((c) => copyMarkdown(c))}>
                      <Copy className="h-4 w-4 me-2" />
                      Copy as Markdown
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() =>
                        void runExport(async (c) => {
                          const bytes = await copyForLlm(c, node.path, title);
                          window.dispatchEvent(
                            new CustomEvent("cabinet:toast", {
                              detail: {
                                kind: "success",
                                message: t("editor:header.copiedForLlmToast", {
                                  size: formatBytes(bytes),
                                }),
                              },
                            })
                          );
                        })
                      }
                    >
                      <Sparkles className="h-4 w-4 me-2" />
                      Copy for LLMs
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void runExport((c) => copyAsHtml(c, node.path))}>
                      <FileCode className="h-4 w-4 me-2" />
                      Copy as HTML
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void runExport((c) => downloadMarkdown(c, title))}>
                      <Download className="h-4 w-4 me-2" />
                      Download Markdown
                    </ContextMenuItem>
                  </>
                ) : (
                  <ContextMenuItem
                    onClick={() =>
                      downloadRawFile(
                        assetUrlFor(node.path),
                        node.path.split("/").pop() || node.name
                      )
                    }
                  >
                    <Download className="h-4 w-4 me-2" />
                    Download file
                  </ContextMenuItem>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onClick={() => openFileHistory(node.path)}>
              <History className="h-4 w-4 me-2" />
              File history
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true })
                )
              }
            >
              <Search className="h-4 w-4 me-2" />
              Search
              <ContextMenuShortcut>⌘K</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={isReadOnly && !node.isLinked}
            onClick={handleDelete}
            className="text-destructive"
          >
            {node.isLinked ? (
              <Link2Off className="h-4 w-4 me-2" />
            ) : (
              <Trash2 className="h-4 w-4 me-2" />
            )}
            {node.isLinked ? t("treeNode:unlink") : t("treeNode:delete")}
            <ContextMenuShortcut>{deleteShortcut}</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, childIndex) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              contextCabinetPath={contextCabinetPath}
              siblings={node.children!}
              onMoveToRequest={onMoveToRequest}
              animationDelayMs={
                hasAnimation
                  ? Math.min(
                      animationDelayMs! +
                        ANIMATION_CHILD_BASE_BUMP_MS +
                        childIndex * ANIMATION_CHILD_SIBLING_MS,
                      ANIMATION_MAX_DELAY_MS
                    )
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <Dialog open={subPageOpen} onOpenChange={setSubPageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add Sub Page to &ldquo;{title}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSubPage();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder={t("treeNode:pageTitlePlaceholder")}
              value={subPageTitle}
              onChange={(e) => setSubPageTitle(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!subPageTitle.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              New Folder in &ldquo;{title}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateFolder();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              disabled={!newFolderName.trim() || creatingFolder}
            >
              {creatingFolder ? "Creating..." : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("treeNode:rename")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameTitle.trim()) return;
              await renamePage(node.path, renameTitle.trim());
              setRenameOpen(false);
            }}
            className="flex gap-2"
          >
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!renameTitle.trim()}>
              Rename
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <LinkRepoDialog open={linkRepoOpen} onOpenChange={setLinkRepoOpen} parentPath={node.path} />

      <ConnectGithubDialog open={githubConnectOpen} onOpenChange={setGithubConnectOpen} parentPath={node.path} />

      <ConnectKnowledgeDialog
        open={connectKnowledgeOpen}
        onOpenChange={setConnectKnowledgeOpen}
        onLocal={() => {
          setConnectKnowledgeOpen(false);
          setLinkRepoOpen(true);
        }}
        onCloud={(provider) => {
          setConnectKnowledgeOpen(false);
          setDriveProvider(provider);
          setConnectDriveOpen(true);
        }}
        onNotion={() => setNotionConnectOpen(true)}
        onAppleNotes={() => setAppleNotesConnectOpen(true)}
        onGithub={() => {
          setGithubConnectOpen(true);
        }}
      />

      <NotionConnectDialog
        open={notionConnectOpen}
        onOpenChange={setNotionConnectOpen}
        targetPath={importTargetPath}
      />

      <AppleNotesConnectDialog
        open={appleNotesConnectOpen}
        onOpenChange={setAppleNotesConnectOpen}
        targetPath={importTargetPath}
      />

      <ConnectDriveDialog
        open={connectDriveOpen}
        onOpenChange={setConnectDriveOpen}
        cabinetPath={contextCabinetPath || ""}
        provider={driveProvider}
        mountAt={node.path}
      />

      <NewCabinetDialog
        open={createCabinetOpen}
        onOpenChange={setCreateCabinetOpen}
        parentPath={node.path}
      />

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        parentPath={importTargetPath}
        contextCabinetPath={contextCabinetPath}
      />

      <EditSymlinkDialog
        open={editSymlinkOpen}
        onOpenChange={setEditSymlinkOpen}
        kbPath={node.path}
      />

      {hasFileSettings && (
        <FileSettingsDialog
          open={fileSettingsOpen}
          onOpenChange={setFileSettingsOpen}
          node={node}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                {node.isLinked
                  ? <Link2Off className="h-4 w-4 text-destructive" />
                  : <TriangleAlert className="h-4 w-4 text-destructive" />
                }
              </div>
              <div className="flex flex-col gap-1">
                <DialogTitle>
                  {node.isLinked
                    ? `Unlink "${title}"`
                    : node.type === "cabinet"
                      ? `Delete Cabinet "${title}"`
                      : `Delete "${title}"`
                  }
                </DialogTitle>
                <DialogDescription>
                  {node.isLinked
                    ? `This will remove the link from your knowledge base. The original folder on disk will not be affected.`
                    : node.type === "cabinet"
                      ? `This will permanently delete the cabinet and everything inside it — all pages, agents, jobs, and tasks. This cannot be undone.`
                      : `This will permanently delete this ${node.type === "directory" ? "page and all its sub-pages" : "file"}. This cannot be undone.`
                  }
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deletePage(node.path);
                setDeleteOpen(false);
              }}
            >
              {node.isLinked ? "Unlink" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Memoised so a parent re-render doesn't cascade through the whole subtree.
// Each row re-renders on its own state via the narrow store selectors above.
export const TreeNode = memo(TreeNodeImpl);
