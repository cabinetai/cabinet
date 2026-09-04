import test from "node:test";
import assert from "node:assert/strict";
import {
  transformMdxToHtml,
  serializeMdxComponent,
  stripMdxForPlaintext,
  parseJsxAttributes,
} from "./jsx";

test("parseJsxAttributes handles strings, expressions, and booleans", () => {
  const props = parseJsxAttributes('type="warning" count={3} open dismissable={true}');
  assert.deepEqual(props, {
    type: "warning",
    count: 3,
    open: true,
    dismissable: true,
  });
});

test("transformMdxToHtml rewrites a self-closing registered component", () => {
  const out = transformMdxToHtml('<VideoPlayer url="https://x.com/v.mp4" />');
  assert.match(out, /data-mdx-component="true"/);
  assert.match(out, /data-name="VideoPlayer"/);
  assert.match(out, /https:\/\/x\.com\/v\.mp4/);
});

test("transformMdxToHtml rewrites a component with children", () => {
  const out = transformMdxToHtml('<Callout type="warning">Danger ahead</Callout>');
  assert.match(out, /data-name="Callout"/);
  assert.match(out, /data-children="Danger ahead"/);
  assert.match(out, /&quot;type&quot;:&quot;warning&quot;/);
});

test("transformMdxToHtml ignores unregistered components and code fences", () => {
  const unknown = "<NotReal foo='bar' />";
  assert.equal(transformMdxToHtml(unknown), unknown);

  const fenced = "```jsx\n<Callout type=\"info\">x</Callout>\n```";
  assert.equal(transformMdxToHtml(fenced), fenced);
});

test("serializeMdxComponent round-trips self-closing and child forms", () => {
  assert.equal(
    serializeMdxComponent("VideoPlayer", { url: "u" }, ""),
    '<VideoPlayer url="u" />'
  );
  assert.equal(
    serializeMdxComponent("Callout", { type: "info" }, "Hello"),
    '<Callout type="info">\nHello\n</Callout>'
  );
});

test("stripMdxForPlaintext produces semantic plain text", () => {
  assert.equal(
    stripMdxForPlaintext('<Callout type="warning">Danger</Callout>'),
    "[Callout (warning): Danger]"
  );
  assert.equal(
    stripMdxForPlaintext('<VideoPlayer url="https://v.mp4" />'),
    "[VideoPlayer: https://v.mp4]"
  );
});

test("nested same-name components match the correct closing tag", () => {
  const out = transformMdxToHtml(
    '<Callout type="info">outer <Callout type="error">inner</Callout> tail</Callout>'
  );
  // A single top-level component should be produced; the inner Callout lives
  // inside the children string.
  const markers = out.match(/data-mdx-component/g) ?? [];
  assert.equal(markers.length, 1);
  assert.match(out, /data-name="Callout"/);
});

test("ModelViewer transform, serialize, and strip", () => {
  const md = '<ModelViewer src="car.glb" autoRotate={true} cameraControls />';
  const out = transformMdxToHtml(md);
  assert.match(out, /data-mdx-component="true"/);
  assert.match(out, /data-name="ModelViewer"/);
  assert.match(out, /car\.glb/);

  assert.equal(
    serializeMdxComponent("ModelViewer", { src: "car.glb", autoRotate: true }, ""),
    '<ModelViewer src="car.glb" autoRotate />'
  );

  assert.equal(
    stripMdxForPlaintext('<ModelViewer src="car.glb" />'),
    "[ModelViewer: car.glb]"
  );
});

