import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  buildMarkdownBundle,
  embedMarkdownImages,
  findMarkdownImageReferences,
  markdownBundleFilename,
  resolveMarkdownImageUrl,
} from "./page-export";

test("finds inline Markdown and HTML image sources", () => {
  const content = [
    "![Chart](./chart.png)",
    "![Photo](<photo with spaces.jpg> \"Title\")",
    '<img alt="Logo" src="./logo.svg">',
  ].join("\n");
  assert.deepEqual(
    findMarkdownImageReferences(content).map((item) => item.source),
    ["./chart.png", "photo with spaces.jpg", "./logo.svg"]
  );
});

test("resolves Cabinet-local images from the page asset base", () => {
  assert.equal(
    resolveMarkdownImageUrl("./chart one.png", "reports/quarterly", "http://cabinet.test"),
    "http://cabinet.test/api/assets/reports/quarterly/chart%20one.png"
  );
  assert.equal(
    resolveMarkdownImageUrl("image.png", "reports", "http://cabinet.test"),
    "http://cabinet.test/api/assets/reports/image.png"
  );
  assert.equal(
    resolveMarkdownImageUrl(
      "./double-resource-challenge-logo-650.gif",
      "Eureka/Articles",
      "http://cabinet.test"
    ),
    "http://cabinet.test/api/assets/Eureka/Articles/double-resource-challenge-logo-650.gif"
  );
  assert.equal(
    resolveMarkdownImageUrl("../shared/logo.svg", "reports/quarterly", "http://cabinet.test"),
    "http://cabinet.test/api/assets/reports/shared/logo.svg"
  );
  assert.equal(resolveMarkdownImageUrl("https://example.com/image.png", "reports"), null);
  assert.equal(resolveMarkdownImageUrl("data:image/png;base64,abc", "reports"), null);
});

test("embeds local images while preserving remote and failed references", async () => {
  const content = [
    "![Local](./local.png)",
    "![Again](./local.png)",
    "![Missing](./missing.png)",
    "![Remote](https://example.com/remote.png)",
  ].join("\n");
  const requests: string[] = [];
  const result = await embedMarkdownImages(content, "page", async (url) => {
    requests.push(url);
    if (url.endsWith("missing.png")) throw new Error("missing");
    return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  });

  assert.equal(requests.filter((url) => url.endsWith("local.png")).length, 1);
  assert.equal(result.failedImages, 1);
  assert.equal((result.content.match(/data:image\/png;base64,AQID/g) || []).length, 2);
  assert.match(result.content, /!\[Missing\]\(\.\/missing\.png\)/);
  assert.match(result.content, /https:\/\/example\.com\/remote\.png/);
});

test("names Markdown bundles without an extra suffix", () => {
  assert.equal(markdownBundleFilename("72%"), "72%.zip");
  assert.equal(markdownBundleFilename("Project / Notes"), "Project _ Notes.zip");
});

test("builds a portable Markdown ZIP with deduplicated image assets", async () => {
  const content = [
    "![First](./photo.png)",
    "![Duplicate](./photo.png)",
    '<img src="diagram.svg">',
  ].join("\n");
  const result = await buildMarkdownBundle(
    content,
    "Project / Notes",
    "docs/page",
    async (url) =>
      new Blob(
        [url.endsWith("photo.png") ? new Uint8Array([1, 2]) : new Uint8Array([3, 4])],
        { type: url.endsWith("photo.png") ? "image/png" : "image/svg+xml" }
      )
  );
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const markdown = await zip.file("Project _ Notes.md")!.async("string");
  const assetPaths = Object.keys(zip.files).filter((path) => !path.endsWith("/") && path !== "Project _ Notes.md");

  assert.equal(result.failedImages, 0);
  assert.deepEqual(assetPaths.sort(), ["assets/01-photo.png", "assets/02-diagram.svg"]);
  assert.equal((markdown.match(/\.\/assets\/01-photo\.png/g) || []).length, 2);
  assert.match(markdown, /src="\.\/assets\/02-diagram\.svg"/);
  assert.deepEqual(
    [...(await zip.file("assets/01-photo.png")!.async("uint8array"))],
    [1, 2]
  );
});
