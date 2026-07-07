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
          "shadow-intensity"?: string | number;
          "skybox-image"?: string;
          "environment-image"?: string;
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
          "shadow-intensity"?: string | number;
          "skybox-image"?: string;
          "environment-image"?: string;
          style?: React.CSSProperties;
        },
        HTMLElement
      >;
    }
  }
}
