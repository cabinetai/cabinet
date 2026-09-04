import * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "auto-rotate"?: boolean | string;
          "camera-controls"?: boolean | string;
          "camera-orbit"?: string;
          "shadow-intensity"?: string | number;
          "skybox-image"?: string;
          "environment-image"?: string;
          "camera-target"?: string;
          "orientation"?: string;
          "scale"?: string;
          "exposure"?: string | number;
          "autoplay"?: boolean | string;
          "animation-name"?: string;
          "max-field-of-view"?: string;
          "min-field-of-view"?: string;
          "field-of-view"?: string;
          "disable-zoom"?: boolean | string;
          "disable-pan"?: boolean | string;
          style?: React.CSSProperties;
        },
        HTMLElement
      >;
    }
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "auto-rotate"?: boolean | string;
          "camera-controls"?: boolean | string;
          "camera-orbit"?: string;
          "shadow-intensity"?: string | number;
          "skybox-image"?: string;
          "environment-image"?: string;
          "camera-target"?: string;
          "orientation"?: string;
          "scale"?: string;
          "exposure"?: string | number;
          "autoplay"?: boolean | string;
          "animation-name"?: string;
          "max-field-of-view"?: string;
          "min-field-of-view"?: string;
          "field-of-view"?: string;
          "disable-zoom"?: boolean | string;
          "disable-pan"?: boolean | string;
          style?: React.CSSProperties;
        },
        HTMLElement
      >;
    }
  }
}
