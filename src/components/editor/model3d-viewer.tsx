"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Settings, Play, Pause, RotateCcw, Download, ExternalLink, Loader2, Eye, EyeOff } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";

interface Model3dViewerProps {
  path: string;
  title: string;
}

export function Model3dViewer({ path, title }: Model3dViewerProps) {
  const src = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "3D";

  // System states
  const [loaded, setLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  // Model-viewer states
  const [autoRotate, setAutoRotate] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"camera" | "model">("model");
  const [shadowIntensity, setShadowIntensity] = useState(0.8);
  const [exposure, setExposure] = useState(1.0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [modelTranslation, setModelTranslation] = useState({ x: 0, y: 0, z: 0 });
  const translationRef = useRef({ x: 0, y: 0, z: 0 });

  // Sync ref with state when state changes programmatically
  useEffect(() => {
    translationRef.current = modelTranslation;
  }, [modelTranslation]);

  const [cameraTarget, setCameraTarget] = useState({ x: 0, y: 0, z: 0 });
  const [environmentImage, setEnvironmentImage] = useState<"neutral" | "none">("neutral");
  const [zoomFov, setZoomFov] = useState(45);
  const [cameraOrbit, setCameraOrbit] = useState({ theta: 0, phi: 75 });
  
  // Animation states
  const [animationsList, setAnimationsList] = useState<string[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(true);

  // Styling states
  const [transparentBg, setTransparentBg] = useState(true);
  const [bgColor, setBgColor] = useState("#1a1a1a");

  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);


  // Dynamically import @google/model-viewer purely client-side
  useEffect(() => {
    import("@google/model-viewer")
      .then(() => setLoaded(true))
      .catch((err) => console.error("Failed to load @google/model-viewer", err));
  }, []);

  const patchRenderer = (viewer: any) => {
    if (!viewer) return;

    // Scan prototype chain symbols to find the renderer (handles minified bundles where symbol description is stripped)
    let currentProto = viewer;
    const symbols: symbol[] = [];
    while (currentProto && currentProto !== Object.prototype) {
      symbols.push(...Object.getOwnPropertySymbols(currentProto));
      currentProto = Object.getPrototypeOf(currentProto);
    }
    const rendererSym = symbols.find((sym) => {
      try {
        const val = viewer[sym];
        return val && typeof val === "object" && "arRenderer" in val;
      } catch {
        return false;
      }
    });

    if (rendererSym) {
      const renderer = viewer[rendererSym];
      if (renderer && renderer.arRenderer && !renderer.arRenderer.__patched_onUpdateScene) {
        const origOnUpdateScene = renderer.arRenderer.onUpdateScene;
        renderer.arRenderer.onUpdateScene = function (this: any, ...args: any[]) {
          if (!this.presentedScene) {
            return; // Skip scene update if not presenting in AR to avoid null pointer crash
          }
          return origOnUpdateScene.apply(this, args);
        };
        renderer.arRenderer.__patched_onUpdateScene = true;
      }
    }
  };

  // Patch model-viewer internal renderer to prevent scale/rotation updates from crashing in non-AR mode
  useEffect(() => {
    if (!loaded) return;
    patchRenderer(viewerRef.current);
  }, [loaded]);

  // Mutate Three.js translation synchronously to bypass React re-render flickering
  const applyThreeTranslation = (x: number, y: number, z: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Scan for internal Three.js scene object
    let currentProto = viewer;
    const symbols: symbol[] = [];
    while (currentProto && currentProto !== Object.prototype) {
      symbols.push(...Object.getOwnPropertySymbols(currentProto));
      currentProto = Object.getPrototypeOf(currentProto);
    }
    const sceneSym = symbols.find((sym) => {
      try {
        const val = viewer[sym];
        return val && typeof val === "object" && (val.isScene || val.type === "Scene");
      } catch {
        return false;
      }
    });

    const scene = sceneSym ? viewer[sceneSym] : null;

    // Identify the model group(s) to translate
    const targets: any[] = [];

    // Try to get from viewer.model.scene first
    if (viewer.model?.scene) {
      targets.push(viewer.model.scene);
    }

    // Also look at the children of the internal scene
    if (scene && scene.children) {
      scene.children.forEach((child: any) => {
        // Skip cameras, lights, and helpers
        if (
          child.isLight || 
          child.type?.includes("Light") ||
          child.isCamera || 
          child.type?.includes("Camera") ||
          child.name === "cabinetAxesHelper" ||
          child.name === "cabinetGridHelper" ||
          child.type?.includes("Helper")
        ) {
          return;
        }
        targets.push(child);
      });
    }

    // Apply position and manually recalculate matrices because matrixAutoUpdate is disabled internally
    targets.forEach((target) => {
      // Set root position
      if (target.position && typeof target.position.set === "function") {
        target.position.set(x, y, z);
      }
      
      // Also apply to immediate children of target (handles double nested glTF roots)
      if (target.children) {
        target.children.forEach((subChild: any) => {
          if (subChild.position && typeof subChild.position.set === "function") {
            subChild.position.set(x, y, z);
          }
          if (typeof subChild.updateMatrix === "function") {
            subChild.updateMatrix();
          }
          if (typeof subChild.updateMatrixWorld === "function") {
            subChild.updateMatrixWorld(true);
          }
        });
      }

      if (typeof target.updateMatrix === "function") {
        target.updateMatrix();
      }
      if (typeof target.updateMatrixWorld === "function") {
        target.updateMatrixWorld(true);
      }
    });

    if (typeof viewer.queueRender === "function") {
      viewer.queueRender();
    }
  };

  // Manage pointer events: block Prosemirror propagation and handle custom drag-rotation/translation
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !loaded) return;

    let dragStart: { x: number; y: number; button: number } | null = null;

    // Block all mouse/touch events from propagating up to prevent Prosemirror from stealing interaction
    const handleEventPropagation = (e: Event) => {
      e.stopPropagation();
    };

    const propagationEvents = ["mousedown", "mouseup", "mousemove", "touchstart", "touchend", "touchmove", "dragstart"];
    for (const eventName of propagationEvents) {
      el.addEventListener(eventName, handleEventPropagation, { passive: false });
    }

    // Block browser context menu for right click drags in model mode
    const handleContextMenu = (e: MouseEvent) => {
      if (interactionMode === "model") {
        e.preventDefault();
      }
    };
    el.addEventListener("contextmenu", handleContextMenu);

    // Custom pointer drag handlers for Rotate/Translate Model mode
    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      if (interactionMode !== "model") return;
      if (e.button !== 0 && e.button !== 2) return; // Left or Right click only
      dragStart = { x: e.clientX, y: e.clientY, button: e.button };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
    };

    const onPointerMove = (e: PointerEvent) => {
      e.stopPropagation();
      if (interactionMode !== "model") return;
      if (!dragStart) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      if (dragStart.button === 0) {
        // Left click drag: Rotate Model (Yaw and Roll)
        const sensitivity = 0.5;
        setRotation((r) => {
          let nextRoll = r.z - dx * sensitivity;
          if (nextRoll > 180) nextRoll -= 360;
          if (nextRoll < -180) nextRoll += 360;

          let nextYaw = r.y + dy * sensitivity;
          if (nextYaw > 180) nextYaw -= 360;
          if (nextYaw < -180) nextYaw += 360;

          return {
            ...r,
            y: Math.round(nextYaw),
            z: Math.round(nextRoll),
          };
        });
      } else if (dragStart.button === 2) {
        // Right click drag: Translate Model (X and Y coordinates)
        const sensitivity = 0.0002; // 0.2mm per pixel of drag for sub-millimeter precision
        const nextX = translationRef.current.x + dx * sensitivity;
        const nextY = translationRef.current.y - dy * sensitivity;
        
        translationRef.current = {
          ...translationRef.current,
          x: nextX,
          y: nextY,
        };

        // Mutate Three.js synchronously to bypass React re-render flickering
        applyThreeTranslation(translationRef.current.x, translationRef.current.y, translationRef.current.z);
      }

      dragStart = { x: e.clientX, y: e.clientY, button: dragStart.button };
    };

    const onPointerUp = (e: PointerEvent) => {
      e.stopPropagation();
      if (!dragStart) return;
      
      const button = dragStart.button;
      dragStart = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}

      // If it was a translation drag, sync back to React state once at the end, rounding to 3 decimals (millimeters)
      if (button === 2) {
        setModelTranslation({
          x: Math.round(translationRef.current.x * 1000) / 1000,
          y: Math.round(translationRef.current.y * 1000) / 1000,
          z: Math.round(translationRef.current.z * 1000) / 1000,
        });
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);

    return () => {
      for (const eventName of propagationEvents) {
        el.removeEventListener(eventName, handleEventPropagation);
      }
      el.removeEventListener("contextmenu", handleContextMenu);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
    };
  }, [loaded, interactionMode]);

  // Synchronize translation changes on load or when state changes programmatically
  useEffect(() => {
    if (modelLoaded) {
      applyThreeTranslation(modelTranslation.x, modelTranslation.y, modelTranslation.z);
    }
  }, [modelTranslation, modelLoaded]);

  // Reset loaded state when source changes
  useEffect(() => {
    setModelLoaded(false);
  }, [src]);

  // Synchronize camera target changes (panning) from user interaction back to state
  useEffect(() => {
    if (!loaded) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    let lastUpdate = 0;
    let finalTimeout: NodeJS.Timeout;

    const handleCameraChange = (event: any) => {
      if (event.detail.source === "user-interaction") {
        const now = Date.now();
        
        clearTimeout(finalTimeout);
        
        // Debounce final position update once mouse stops moving
        finalTimeout = setTimeout(() => {
          const target = viewer.getCameraTarget();
          setCameraTarget({
            x: Math.round(target.x * 100) / 100,
            y: Math.round(target.y * 100) / 100,
            z: Math.round(target.z * 100) / 100,
          });
          const fov = viewer.getFieldOfView();
          setZoomFov(Math.round(fov));
          const orbit = viewer.getCameraOrbit();
          setCameraOrbit({
            theta: Math.round(orbit.theta * (180 / Math.PI)),
            phi: Math.round(orbit.phi * (180 / Math.PI)),
          });
        }, 150);

        // Throttle updates while dragging to prevent layout rendering bottleneck
        if (now - lastUpdate < 100) return;
        lastUpdate = now;

        const target = viewer.getCameraTarget();
        setCameraTarget({
          x: Math.round(target.x * 100) / 100,
          y: Math.round(target.y * 100) / 100,
          z: Math.round(target.z * 100) / 100,
        });
        const fov = viewer.getFieldOfView();
        setZoomFov(Math.round(fov));
        const orbit = viewer.getCameraOrbit();
        setCameraOrbit({
          theta: Math.round(orbit.theta * (180 / Math.PI)),
          phi: Math.round(orbit.phi * (180 / Math.PI)),
        });
      }
    };

    viewer.addEventListener("camera-change", handleCameraChange);
    return () => {
      viewer.removeEventListener("camera-change", handleCameraChange);
      clearTimeout(finalTimeout);
    };
  }, [loaded]);

  // Listen to the model-viewer load events using a native ref and event listener
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Check if the model is already loaded (handles caches/re-renders)
    if (viewer.loaded) {
      patchRenderer(viewer);
      setModelLoaded(true);
      const anims = viewer.availableAnimations || [];
      setAnimationsList(anims);
      if (anims.length > 0 && !currentAnimation) {
        setCurrentAnimation(anims[0]);
      }
      const target = viewer.getCameraTarget();
      setCameraTarget({
        x: Math.round(target.x * 100) / 100,
        y: Math.round(target.y * 100) / 100,
        z: Math.round(target.z * 100) / 100,
      });
      const fov = viewer.getFieldOfView();
      setZoomFov(Math.round(fov));
      const orbit = viewer.getCameraOrbit();
      setCameraOrbit({
        theta: Math.round(orbit.theta * (180 / Math.PI)),
        phi: Math.round(orbit.phi * (180 / Math.PI)),
      });
    }

    const handleLoad = () => {
      patchRenderer(viewer);
      setModelLoaded(true);
      const anims = viewer.availableAnimations || [];
      setAnimationsList(anims);
      if (anims.length > 0 && !currentAnimation) {
        setCurrentAnimation(anims[0]);
      }
      const target = viewer.getCameraTarget();
      setCameraTarget({
        x: Math.round(target.x * 100) / 100,
        y: Math.round(target.y * 100) / 100,
        z: Math.round(target.z * 100) / 100,
      });
      const fov = viewer.getFieldOfView();
      setZoomFov(Math.round(fov));
      const orbit = viewer.getCameraOrbit();
      setCameraOrbit({
        theta: Math.round(orbit.theta * (180 / Math.PI)),
        phi: Math.round(orbit.phi * (180 / Math.PI)),
      });
    };

    viewer.addEventListener("load", handleLoad);
    return () => {
      viewer.removeEventListener("load", handleLoad);
    };
  }, [loaded, src, currentAnimation]);

  // Sync play/pause commands with the model-viewer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelLoaded) return;
    if (isPlaying) {
      viewer.play();
    } else {
      viewer.pause();
    }
  }, [isPlaying, currentAnimation, modelLoaded]);

  const handleResetCamera = () => {
    setScale(1.0);
    setRotation({ x: 0, y: 0, z: 0 });
    setModelTranslation({ x: 0, y: 0, z: 0 });
    setCameraTarget({ x: 0, y: 0, z: 0 });
    setExposure(1.0);
    setShadowIntensity(0.8);
    setAutoRotate(false);
    setZoomFov(45);
    setCameraOrbit({ theta: 0, phi: 75 });
    setInteractionMode("model");
    
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.cameraOrbit = "unset";
      viewer.cameraTarget = "unset";
      viewer.fieldOfView = "unset";
    }
  };





  // Register native wheel listener for custom zoom to prevent browser scroll in Rotate Model mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (interactionMode === "model") {
        e.preventDefault();
        // Zoom in/out of the uniform scale of the 3D model
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale((s) => {
          const nextScale = Math.round((s + delta) * 10) / 10;
          return Math.max(0.1, Math.min(5.0, nextScale));
        });
      }
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleNativeWheel);
    };
  }, [interactionMode]);

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge={ext}>
          <ToolbarButton
            icon={Settings}
            label="Controls"
            active={showPanel}
            onClick={() => setShowPanel(!showPanel)}
          />
          <ToolbarButton
            icon={RotateCcw}
            label="Reset View"
            onClick={handleResetCamera}
          />
          <ToolbarButton
            icon={Download}
            label="Download"
            href={src}
            download={filename}
          />
          <ToolbarButton
            icon={ExternalLink}
            label="Open Raw"
            iconOnly
            href={src}
            target="_blank"
          />
        </ViewerToolbar>
      }
    >
      <div className="flex-1 relative flex overflow-hidden h-full min-h-0 bg-muted/5">
        {/* Main Canvas Area */}
        <div 
          ref={containerRef}
          className="flex-1 flex items-center justify-center relative min-h-0 min-w-0 h-full touch-none select-none"
        >
          {!loaded ? (
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground animate-pulse">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Loading 3D Engine...
            </div>
          ) : (
            <>
              {/* Secondary loader overlay for the specific model file */}
              {!modelLoaded && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/50 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Loading 3D model...</span>
                </div>
              )}

              <model-viewer
                ref={viewerRef}
                src={src}
                alt={title}
                auto-rotate={autoRotate ? "true" : undefined}
                camera-controls={interactionMode === "camera" ? "true" : undefined}
                disable-zoom={interactionMode === "model" ? "true" : undefined}
                disable-pan={interactionMode === "model" ? "true" : undefined}
                shadow-intensity={String(shadowIntensity)}
                exposure={String(exposure)}
                scale={`${scale} ${scale} ${scale}`}
                orientation={`${rotation.x}deg ${rotation.y}deg ${rotation.z}deg`}
                camera-target={`${cameraTarget.x}m ${cameraTarget.y}m ${cameraTarget.z}m`}
                environment-image={environmentImage === "neutral" ? "neutral" : undefined}
                animation-name={currentAnimation || undefined}
                autoplay={isPlaying ? "true" : undefined}
                max-field-of-view="180deg"
                field-of-view={`${zoomFov}deg`}
                camera-orbit={`${cameraOrbit.theta}deg ${cameraOrbit.phi}deg auto`}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  backgroundColor: transparentBg ? "transparent" : bgColor,
                  pointerEvents: interactionMode === "camera" ? "auto" : "none",
                }}
              />
            </>
          )}
        </div>

        {/* Floating Settings Sidebar panel */}
        <div
          className={`absolute top-4 bottom-4 right-4 z-30 flex flex-col bg-background/90 backdrop-blur-md border border-border rounded-xl shadow-xl w-72 overflow-y-auto transition-all duration-300 ease-out select-none ${
            showPanel ? "translate-x-0 opacity-100" : "translate-x-full pointer-events-none opacity-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/60 p-4">
            <h3 className="font-semibold text-sm">Viewer Settings</h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-muted-foreground/60 hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-5 text-xs">
            {/* Camera Settings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-1">
                <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Camera Settings</h4>
              </div>
              
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span className="text-muted-foreground/80">Mouse Drag Interaction</span>
                <select
                  value={interactionMode}
                  onChange={(e: any) => setInteractionMode(e.target.value)}
                  className="bg-muted border border-border/65 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-primary w-36"
                >
                  <option value="camera">Camera</option>
                  <option value="model">3D Model</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Camera Zoom ({Math.max(0, Math.min(100, Math.round(((120 - zoomFov) / (120 - 10)) * 100)))}%)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.max(0, Math.min(100, Math.round(((120 - zoomFov) / (120 - 10)) * 100)))}
                  onChange={(e) => {
                    const percent = parseInt(e.target.value);
                    const fov = 120 - (percent / 100) * (120 - 10);
                    setZoomFov(fov);
                  }}
                  className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="text-muted-foreground">Camera View Angle (Yaw / Pitch)</div>
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground/75 uppercase text-center">Yaw ({cameraOrbit.theta}°)</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={cameraOrbit.theta}
                      onChange={(e) => setCameraOrbit(o => ({ ...o, theta: parseInt(e.target.value) || 0 }))}
                      className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground/75 uppercase text-center">Pitch ({cameraOrbit.phi}°)</span>
                    <input
                      type="range"
                      min="0"
                      max="180"
                      step="1"
                      value={cameraOrbit.phi}
                      onChange={(e) => setCameraOrbit(o => ({ ...o, phi: parseInt(e.target.value) || 0 }))}
                      className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="text-muted-foreground">Camera Pivot Center (X, Y, Z meters)</div>
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground/75 uppercase text-center">X</span>
                    <input
                      type="number"
                      step="0.1"
                      value={cameraTarget.x}
                      onChange={(e) => setCameraTarget(t => ({ ...t, x: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-center bg-muted/40 border border-border/50 rounded px-1.5 py-1 focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground/75 uppercase text-center">Y</span>
                    <input
                      type="number"
                      step="0.1"
                      value={cameraTarget.y}
                      onChange={(e) => setCameraTarget(t => ({ ...t, y: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-center bg-muted/40 border border-border/50 rounded px-1.5 py-1 focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground/75 uppercase text-center">Z</span>
                    <input
                      type="number"
                      step="0.1"
                      value={cameraTarget.z}
                      onChange={(e) => setCameraTarget(t => ({ ...t, z: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-center bg-muted/40 border border-border/50 rounded px-1.5 py-1 focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3D Model Settings */}
            <div className="space-y-4 pt-2">
              <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] border-b border-border/40 pb-1">3D Model Settings</h4>

              <label className="flex items-center gap-2 text-muted-foreground/80 hover:text-foreground cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(e) => setAutoRotate(e.target.checked)}
                  className="rounded border-border bg-muted text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Auto-Rotate Model</span>
              </label>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Uniform Scale ({scale.toFixed(2)}x)</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              <div className="space-y-3 pt-1">
                <div className="text-muted-foreground">Model Rotation (Pitch / Yaw / Roll)</div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground/80">
                    <span>Pitch</span>
                    <span>{rotation.x}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation.x}
                    onChange={(e) => setRotation(r => ({ ...r, x: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground/80">
                    <span>Yaw</span>
                    <span>{rotation.y}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation.y}
                    onChange={(e) => setRotation(r => ({ ...r, y: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground/80">
                    <span>Roll</span>
                    <span>{rotation.z}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation.z}
                    onChange={(e) => setRotation(r => ({ ...r, z: parseInt(e.target.value) || 0 }))}
                    className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                  />
                </div>

                <div className="space-y-2 pt-1 border-t border-border/40 mt-2">
                  <div className="text-muted-foreground">Model Position (X, Y meters)</div>
                  <div className="flex gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[9px] text-muted-foreground/75 uppercase text-center">X</span>
                      <input
                        type="number"
                        step="0.005"
                        value={modelTranslation.x}
                        onChange={(e) => setModelTranslation(t => ({ ...t, x: parseFloat(e.target.value) || 0 }))}
                        className="w-full text-center bg-muted/40 border border-border/50 rounded px-1.5 py-1 focus:outline-none focus:border-primary text-xs"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[9px] text-muted-foreground/75 uppercase text-center">Y</span>
                      <input
                        type="number"
                        step="0.005"
                        value={modelTranslation.y}
                        onChange={(e) => setModelTranslation(t => ({ ...t, y: parseFloat(e.target.value) || 0 }))}
                        className="w-full text-center bg-muted/40 border border-border/50 rounded px-1.5 py-1 focus:outline-none focus:border-primary text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lighting settings */}
            <div className="space-y-3 border-t border-border/60 pt-4">
              <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Lighting & Environment</h4>
              
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Lighting Preset</span>
                <select
                  value={environmentImage}
                  onChange={(e: any) => setEnvironmentImage(e.target.value)}
                  className="bg-muted border border-border/65 rounded px-2 py-1 text-xs focus:outline-none focus:border-primary w-32"
                >
                  <option value="neutral">Neutral (Default)</option>
                  <option value="none">None (Basic)</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Exposure ({exposure.toFixed(2)})</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={exposure}
                  onChange={(e) => setExposure(parseFloat(e.target.value))}
                  className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Shadow Opacity ({shadowIntensity.toFixed(2)})</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={shadowIntensity}
                  onChange={(e) => setShadowIntensity(parseFloat(e.target.value))}
                  className="w-full accent-primary bg-muted rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Styling options */}
            <div className="space-y-3 border-t border-border/60 pt-4">
              <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Appearance</h4>
              
              <label className="flex items-center gap-2 text-muted-foreground/80 hover:text-foreground cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                  className="rounded border-border bg-muted text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Transparent Background</span>
              </label>

              {!transparentBg && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted-foreground">Canvas Background</span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-6 w-12 rounded border border-border/60 bg-transparent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Animation control */}
            {animationsList.length > 0 && (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <h4 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Animations</h4>
                
                <div className="flex flex-col gap-2">
                  <select
                    value={currentAnimation}
                    onChange={(e) => {
                      setCurrentAnimation(e.target.value);
                      setIsPlaying(true);
                    }}
                    className="bg-muted border border-border/65 rounded px-2 py-1 text-xs focus:outline-none focus:border-primary w-full"
                  >
                    {animationsList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsPlaying(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-border/50 text-xs transition-colors cursor-pointer ${
                        isPlaying ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted/70 text-foreground"
                      }`}
                    >
                      <Play className="h-3 w-3" />
                      Play
                    </button>
                    <button
                      onClick={() => setIsPlaying(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-border/50 text-xs transition-colors cursor-pointer ${
                        !isPlaying ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted/70 text-foreground"
                      }`}
                    >
                      <Pause className="h-3 w-3" />
                      Pause
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ViewerLayout>
  );
}
