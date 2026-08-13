export type RenderStats = {
  fps: number;
  frameMs: number;
  sceneBuildMs: number;
  uploadMs: number;
  objects: number;
  visibleObjects: number;
  zoom: number;
};

export type InteractionHandlers = {
  hitTest: (x: number, y: number) => string | undefined;
  select: (id: string | undefined, additive: boolean) => void;
  moveSelection: (dx: number, dy: number) => void;
  resizeSelection: (handle: ResizeHandle, dx: number, dy: number) => void;
  beginEdit: () => void;
  endEdit: () => void;
  updateMarquee: (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => void;
  endMarquee: (
    bounds: { left: number; top: number; right: number; bottom: number },
    additive: boolean,
  ) => void;
};

export type CanvasTool = "select" | "hand";
export type ColorTheme = "dark" | "light";
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type SelectionNodeBounds = {
  id: string;
  kind: "frame" | "rectangle" | "group" | "text" | "image" | "icon";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

const FLOATS_PER_RECT = 24;
const SHADER = /* wgsl */ `
struct View {
  viewport_pan: vec4f,
  zoom_padding: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;

struct VertexInput {
  @location(0) unit: vec2f,
  @location(1) bounds: vec4f,
  @location(2) color: vec4f,
  @location(3) stroke: vec4f,
  @location(4) style: vec4f,
  @location(5) radii: vec4f,
  @location(6) transform: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) local: vec2f,
  @location(2) size: vec2f,
  @location(3) stroke: vec4f,
  @location(4) style: vec4f,
  @location(5) radii: vec4f,
}

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
  let center = input.bounds.xy + input.bounds.zw * 0.5;
  let scaled = (input.unit - vec2f(0.5)) * input.bounds.zw * input.transform.yz;
  let rotated = vec2f(scaled.x * cos(input.transform.x) - scaled.y * sin(input.transform.x), scaled.x * sin(input.transform.x) + scaled.y * cos(input.transform.x));
  let world = center + rotated;
  let screen = world * view.zoom_padding.x + view.viewport_pan.zw;
  let clip = vec2f(
    screen.x / view.viewport_pan.x * 2.0 - 1.0,
    1.0 - screen.y / view.viewport_pan.y * 2.0,
  );

  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  output.color = input.color;
  output.local = input.unit * input.bounds.zw;
  output.size = input.bounds.zw;
  output.stroke = input.stroke;
  output.style = input.style;
  output.radii = input.radii;
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let right = input.local.x >= input.size.x * 0.5;
  let bottom = input.local.y >= input.size.y * 0.5;
  let radius = select(select(input.radii.x, input.radii.y, right), select(input.radii.w, input.radii.z, right), bottom);
  if (input.style.z == 1.0) {
    let inset = input.stroke.x;
    let shadowSize = input.size - vec2f(inset * 2.0);
    let shadowLocal = input.local - vec2f(inset);
    let boundedRadius = min(radius, min(shadowSize.x, shadowSize.y) * 0.5);
    let centered = abs(shadowLocal - shadowSize * 0.5) - (shadowSize * 0.5 - vec2f(boundedRadius));
    let distance = length(max(centered, vec2f(0.0))) + min(max(centered.x, centered.y), 0.0) - radius;
    let alpha = 1.0 - smoothstep(-input.stroke.y, input.stroke.y, distance);
    return vec4f(input.color.rgb, input.color.a * alpha * input.style.y);
  }
  let boundedRadius = min(radius, min(input.size.x, input.size.y) * 0.5);
  let centered = abs(input.local - input.size * 0.5) - (input.size * 0.5 - vec2f(boundedRadius));
  let distance = length(max(centered, vec2f(0.0))) + min(max(centered.x, centered.y), 0.0) - boundedRadius;
  let coverage = 1.0 - smoothstep(-0.75, 0.75, distance);
  if (input.style.z == 2.0) {
    let contractedSize = max(vec2f(1.0), input.size - vec2f(input.stroke.w * 2.0));
    let shiftedLocal = input.local - vec2f(input.stroke.x, input.stroke.y) - vec2f(input.stroke.w);
    let innerRadius = min(max(0.0, boundedRadius - input.stroke.w), min(contractedSize.x, contractedSize.y) * 0.5);
    let innerCentered = abs(shiftedLocal - contractedSize * 0.5) - (contractedSize * 0.5 - vec2f(innerRadius));
    let innerDistance = length(max(innerCentered, vec2f(0.0))) + min(max(innerCentered.x, innerCentered.y), 0.0) - innerRadius;
    let alpha = smoothstep(-input.stroke.z, input.stroke.z, innerDistance) * coverage;
    return vec4f(input.color.rgb, input.color.a * alpha * input.style.y);
  }
  let borderMix = select(
    0.0,
    smoothstep(-input.style.x - 0.5, -input.style.x + 0.5, distance),
    input.style.x > 0.0,
  );
  let color = mix(input.color, input.stroke, borderMix);
  return vec4f(color.rgb, color.a * coverage * input.style.y);
}
`;

export class OpenLibraRenderer {
  private animationFrame = 0;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private instanceBufferCapacity: number;
  private readonly vertexBuffer: GPUBuffer;
  private pan = { x: 20, y: 20 };
  private targetPan = { x: 20, y: 20 };
  private zoom = 0.8;
  private targetZoom = 0.8;
  private dragging = false;
  private draggingSelection = false;
  private marqueeStart?: {
    clientX: number;
    clientY: number;
    worldX: number;
    worldY: number;
  };
  private marqueeAdditive = false;
  private interactions?: InteractionHandlers;
  private tool: CanvasTool = "select";
  private selectionBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  };
  private selectionNodes: SelectionNodeBounds[] = [];
  private resizingHandle?: ResizeHandle;
  private clearColor = { r: 0.075, g: 0.08, b: 0.095, a: 1 };
  private lastPointer = { x: 0, y: 0 };
  private lastSample = performance.now();
  private frameCount = 0;
  private frameTotal = 0;
  private frameListeners = new Set<() => void>();
  private previousFrameTime = performance.now();
  private sceneBounds = { x: 0, y: 0, width: 1, height: 1 };
  private sceneData: Float32Array<ArrayBufferLike> = new Float32Array();
  private visibleSceneData: Float32Array<ArrayBufferLike> = new Float32Array();
  private totalObjectCount = 0;
  private lastCullingView?: {
    panX: number;
    panY: number;
    zoom: number;
    width: number;
    height: number;
  };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private objectCount: number,
    private sceneBuildMs: number,
    private uploadMs: number,
    private readonly onStats: (stats: RenderStats) => void,
    onError: (message: string) => void,
    resources: {
      context: GPUCanvasContext;
      format: GPUTextureFormat;
      pipeline: GPURenderPipeline;
      bindGroup: GPUBindGroup;
      uniformBuffer: GPUBuffer;
      instanceBuffer: GPUBuffer;
      vertexBuffer: GPUBuffer;
    },
  ) {
    this.context = resources.context;
    this.format = resources.format;
    this.pipeline = resources.pipeline;
    this.bindGroup = resources.bindGroup;
    this.uniformBuffer = resources.uniformBuffer;
    this.instanceBuffer = resources.instanceBuffer;
    this.instanceBufferCapacity = Math.max(
      4,
      objectCount * FLOATS_PER_RECT * Float32Array.BYTES_PER_ELEMENT,
    );
    this.vertexBuffer = resources.vertexBuffer;
  }

  static async create(
    canvas: HTMLCanvasElement,
    rectData: Float32Array,
    sceneBuildMs: number,
    onStats: (stats: RenderStats) => void,
    onError: (message: string) => void,
  ) {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter)
      throw new Error(
        "WebGPU is available, but no compatible GPU adapter was found.",
      );
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("Could not create a WebGPU canvas context.");

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const shader = device.createShaderModule({
      label: "Open Libra rectangles",
      code: SHADER,
    });
    const pipeline = device.createRenderPipeline({
      label: "Open Libra instanced rectangle pipeline",
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: FLOATS_PER_RECT * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "float32x4" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
              { shaderLocation: 3, offset: 32, format: "float32x4" },
              { shaderLocation: 4, offset: 48, format: "float32x4" },
              { shaderLocation: 5, offset: 64, format: "float32x4" },
              { shaderLocation: 6, offset: 80, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragment_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const vertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    const vertexBuffer = createBuffer(device, vertices, GPUBufferUsage.VERTEX);
    const uploadStarted = performance.now();
    const instanceBuffer = createBuffer(
      device,
      rectData,
      GPUBufferUsage.VERTEX,
    );
    const uploadMs = performance.now() - uploadStarted;
    const uniformBuffer = device.createBuffer({
      label: "Open Libra viewport uniform",
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    device.lost.then((info) =>
      onError(
        `The GPU device was lost: ${info.message || info.reason}. Reload to reconnect.`,
      ),
    );

    const renderer = new OpenLibraRenderer(
      canvas,
      device,
      rectData.length / FLOATS_PER_RECT,
      sceneBuildMs,
      uploadMs,
      onStats,
      onError,
      {
        context,
        format,
        pipeline,
        bindGroup,
        uniformBuffer,
        instanceBuffer,
        vertexBuffer,
      },
    );
    renderer.sceneBounds = measureSceneBounds(rectData);
    renderer.sceneData = rectData;
    renderer.visibleSceneData = new Float32Array(rectData.length);
    renderer.totalObjectCount = rectData.length / FLOATS_PER_RECT;
    renderer.updateVisibleInstances(true);
    return renderer;
  }

  start() {
    this.animationFrame = requestAnimationFrame(this.render);
  }

  onFrame(listener: () => void) {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  zoomBy(factor: number) {
    const center = {
      x: this.canvas.clientWidth / 2,
      y: this.canvas.clientHeight / 2,
    };
    this.setZoomAround(center, this.targetZoom * factor);
  }

  setScene(rectData: Float32Array, sceneBuildMs = this.sceneBuildMs) {
    const uploadStarted = performance.now();
    if (rectData.byteLength > this.instanceBufferCapacity) {
      const nextBuffer = createBuffer(
        this.device,
        rectData,
        GPUBufferUsage.VERTEX,
      );
      this.instanceBuffer.destroy();
      this.instanceBuffer = nextBuffer;
      this.instanceBufferCapacity = Math.max(4, rectData.byteLength);
    }
    this.sceneData = rectData;
    if (this.visibleSceneData.length < rectData.length)
      this.visibleSceneData = new Float32Array(rectData.length);
    this.totalObjectCount = rectData.length / FLOATS_PER_RECT;
    this.objectCount = this.totalObjectCount;
    this.sceneBuildMs = sceneBuildMs;
    this.uploadMs = performance.now() - uploadStarted;
    this.sceneBounds = measureSceneBounds(rectData);
    this.updateVisibleInstances(true);
  }

  setVisibleScene(rectData: Float32Array, sceneBuildMs = this.sceneBuildMs) {
    const uploadStarted = performance.now();
    if (rectData.byteLength > this.instanceBufferCapacity) {
      const nextBuffer = createBuffer(
        this.device,
        rectData,
        GPUBufferUsage.VERTEX,
      );
      this.instanceBuffer.destroy();
      this.instanceBuffer = nextBuffer;
      this.instanceBufferCapacity = Math.max(4, rectData.byteLength);
    } else if (rectData.length > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, rectData);
    }
    this.objectCount = rectData.length / FLOATS_PER_RECT;
    this.sceneBuildMs = sceneBuildMs;
    this.uploadMs = performance.now() - uploadStarted;
  }

  setInteractionHandlers(handlers: InteractionHandlers) {
    this.interactions = handlers;
  }

  setTool(tool: CanvasTool) {
    this.tool = tool;
    this.canvas.dataset.tool = tool;
  }

  setTheme(theme: ColorTheme) {
    this.clearColor =
      theme === "light"
        ? { r: 0.9, g: 0.91, b: 0.93, a: 1 }
        : { r: 0.075, g: 0.08, b: 0.095, a: 1 };
  }

  getViewState() {
    return { pan: { ...this.pan }, zoom: this.zoom };
  }

  getVisibleWorldBounds() {
    const margin = 128 / this.zoom;
    return {
      left: -this.pan.x / this.zoom - margin,
      top: -this.pan.y / this.zoom - margin,
      right: (this.canvas.clientWidth - this.pan.x) / this.zoom + margin,
      bottom: (this.canvas.clientHeight - this.pan.y) / this.zoom + margin,
    };
  }

  setSelectionBounds(bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  }) {
    this.selectionBounds = bounds;
  }

  getSelectionBounds() {
    return this.selectionBounds ? { ...this.selectionBounds } : undefined;
  }

  setSelectionNodes(nodes: SelectionNodeBounds[]) {
    this.selectionNodes = nodes.map((node) => ({ ...node }));
  }

  getSelectionNodes() {
    return this.selectionNodes.map((node) => ({ ...node }));
  }

  resizeHandleFromClient(clientX: number, clientY: number) {
    const world = this.worldPointFromClient(clientX, clientY);
    return this.hitResizeHandle(world.x, world.y);
  }

  isResizingSelection() {
    return this.resizingHandle !== undefined;
  }

  resetView() {
    this.targetPan = { x: 20, y: 20 };
    this.targetZoom = 1;
  }

  zoomToFit() {
    const { x, y, width: sceneWidth, height: sceneHeight } = this.sceneBounds;
    const padding = 48;
    this.targetZoom = Math.max(
      0.1,
      Math.min(
        4,
        Math.min(
          (this.canvas.clientWidth - padding * 2) / sceneWidth,
          (this.canvas.clientHeight - padding * 2) / sceneHeight,
        ),
      ),
    );
    this.targetPan = {
      x: padding - x * this.targetZoom,
      y: padding - y * this.targetZoom,
    };
  }

  centerOnBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const fitZoom = Math.min(
      (this.canvas.clientWidth - 120) / Math.max(1, bounds.width),
      (this.canvas.clientHeight - 120) / Math.max(1, bounds.height),
    );
    this.targetZoom = Math.max(0.1, Math.min(1.5, fitZoom));
    this.targetPan = {
      x:
        this.canvas.clientWidth / 2 -
        (bounds.x + bounds.width / 2) * this.targetZoom,
      y:
        this.canvas.clientHeight / 2 -
        (bounds.y + bounds.height / 2) * this.targetZoom,
    };
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.frameListeners.clear();
    this.vertexBuffer.destroy();
    this.instanceBuffer.destroy();
    this.uniformBuffer.destroy();
  }

  pointerDown(input: {
    clientX: number;
    clientY: number;
    button: number;
    additive?: boolean;
  }) {
    const world = this.worldPointFromClient(input.clientX, input.clientY);
    const shouldPan = this.tool === "hand" || input.button === 1;
    this.resizingHandle =
      !shouldPan && input.button === 0
        ? this.hitResizeHandle(world.x, world.y)
        : undefined;
    const hit =
      !shouldPan && !this.resizingHandle && input.button === 0
        ? this.interactions?.hitTest(world.x, world.y)
        : undefined;
    this.draggingSelection = hit !== undefined;
    this.dragging = shouldPan;
    this.marqueeStart =
      !shouldPan && !this.resizingHandle && !hit && input.button === 0
        ? {
            clientX: input.clientX,
            clientY: input.clientY,
            worldX: world.x,
            worldY: world.y,
          }
        : undefined;
    this.marqueeAdditive = Boolean(input.additive);
    if (this.draggingSelection || this.resizingHandle)
      this.interactions?.beginEdit();
    this.targetPan = { ...this.pan };
    this.targetZoom = this.zoom;
    this.lastPointer = { x: input.clientX, y: input.clientY };
  }

  pointerMove(input: { clientX: number; clientY: number }) {
    const dx = input.clientX - this.lastPointer.x;
    const dy = input.clientY - this.lastPointer.y;
    if (this.resizingHandle) {
      this.interactions?.resizeSelection(
        this.resizingHandle,
        dx / this.zoom,
        dy / this.zoom,
      );
    } else if (this.draggingSelection) {
      this.interactions?.moveSelection(dx / this.zoom, dy / this.zoom);
    } else if (this.dragging) {
      this.pan.x += dx;
      this.pan.y += dy;
      this.targetPan = { ...this.pan };
    } else if (this.marqueeStart) {
      this.interactions?.updateMarquee(
        { x: this.marqueeStart.clientX, y: this.marqueeStart.clientY },
        { x: input.clientX, y: input.clientY },
      );
    } else return;
    this.lastPointer = { x: input.clientX, y: input.clientY };
  }

  pointerEnd() {
    if (this.draggingSelection || this.resizingHandle)
      this.interactions?.endEdit();
    if (this.marqueeStart) {
      const end = this.worldPointFromClient(
        this.lastPointer.x,
        this.lastPointer.y,
      );
      this.interactions?.endMarquee(
        {
          left: Math.min(this.marqueeStart.worldX, end.x),
          top: Math.min(this.marqueeStart.worldY, end.y),
          right: Math.max(this.marqueeStart.worldX, end.x),
          bottom: Math.max(this.marqueeStart.worldY, end.y),
        },
        this.marqueeAdditive,
      );
    }
    this.dragging = false;
    this.draggingSelection = false;
    this.resizingHandle = undefined;
    this.marqueeStart = undefined;
  }

  wheel(input: { clientX: number; clientY: number; deltaY: number }) {
    const bounds = this.canvas.getBoundingClientRect();
    const cursor = {
      x: input.clientX - bounds.left,
      y: input.clientY - bounds.top,
    };
    this.setZoomAround(
      cursor,
      this.targetZoom * Math.exp(-input.deltaY * 0.0015),
    );
  }

  private render = (time: number) => {
    const frameStarted = performance.now();
    const elapsed = Math.min(50, time - this.previousFrameTime);
    this.previousFrameTime = time;
    const easing = 1 - Math.exp(-elapsed / 70);
    this.zoom += (this.targetZoom - this.zoom) * easing;
    this.pan.x += (this.targetPan.x - this.pan.x) * easing;
    this.pan.y += (this.targetPan.y - this.pan.y) * easing;

    if (Math.abs(this.targetZoom - this.zoom) < 0.0001)
      this.zoom = this.targetZoom;
    if (Math.abs(this.targetPan.x - this.pan.x) < 0.01)
      this.pan.x = this.targetPan.x;
    if (Math.abs(this.targetPan.y - this.pan.y) < 0.01)
      this.pan.y = this.targetPan.y;
    this.resizeCanvas();
    this.updateVisibleInstances(false);
    const view = new Float32Array([
      this.canvas.width,
      this.canvas.height,
      this.pan.x * devicePixelRatio,
      this.pan.y * devicePixelRatio,
      this.zoom * devicePixelRatio,
      0,
      0,
      0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, view);

    const encoder = this.device.createCommandEncoder({
      label: "Open Libra frame",
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: this.clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(6, this.objectCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    for (const listener of this.frameListeners) listener();

    const frameMs = performance.now() - frameStarted;
    this.frameCount += 1;
    this.frameTotal += frameMs;
    if (time - this.lastSample >= 500) {
      this.onStats({
        fps: (this.frameCount * 1_000) / (time - this.lastSample),
        frameMs: this.frameTotal / this.frameCount,
        sceneBuildMs: this.sceneBuildMs,
        uploadMs: this.uploadMs,
        objects: this.totalObjectCount,
        visibleObjects: this.objectCount,
        zoom: this.zoom,
      });
      this.lastSample = time;
      this.frameCount = 0;
      this.frameTotal = 0;
    }

    this.animationFrame = requestAnimationFrame(this.render);
  };

  private updateVisibleInstances(force: boolean) {
    const previous = this.lastCullingView;
    if (
      !force &&
      previous &&
      previous.width === this.canvas.clientWidth &&
      previous.height === this.canvas.clientHeight &&
      Math.abs(previous.panX - this.pan.x) < 64 &&
      Math.abs(previous.panY - this.pan.y) < 64 &&
      Math.abs(Math.log(previous.zoom / this.zoom)) < 0.08
    )
      return;

    this.lastCullingView = {
      panX: this.pan.x,
      panY: this.pan.y,
      zoom: this.zoom,
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    };
    const margin = 128 / this.zoom;
    const left = -this.pan.x / this.zoom - margin;
    const top = -this.pan.y / this.zoom - margin;
    const right = (this.canvas.clientWidth - this.pan.x) / this.zoom + margin;
    const bottom = (this.canvas.clientHeight - this.pan.y) / this.zoom + margin;
    let visibleFloats = 0;
    for (
      let offset = 0;
      offset < this.sceneData.length;
      offset += FLOATS_PER_RECT
    ) {
      const x = this.sceneData[offset];
      const y = this.sceneData[offset + 1];
      const width = this.sceneData[offset + 2];
      const height = this.sceneData[offset + 3];
      if (x + width < left || x > right || y + height < top || y > bottom)
        continue;
      this.visibleSceneData.set(
        this.sceneData.subarray(offset, offset + FLOATS_PER_RECT),
        visibleFloats,
      );
      visibleFloats += FLOATS_PER_RECT;
    }
    this.objectCount = visibleFloats / FLOATS_PER_RECT;
    if (visibleFloats > 0)
      this.device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        this.visibleSceneData.subarray(0, visibleFloats),
      );
  }

  private resizeCanvas() {
    const width = Math.max(
      1,
      Math.floor(this.canvas.clientWidth * devicePixelRatio),
    );
    const height = Math.max(
      1,
      Math.floor(this.canvas.clientHeight * devicePixelRatio),
    );
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque",
      });
    }
  }

  private setZoomAround(
    cursor: { x: number; y: number },
    targetZoom: number,
    worldPoint?: { x: number; y: number },
  ) {
    const before = worldPoint ?? {
      x: (cursor.x - this.targetPan.x) / this.targetZoom,
      y: (cursor.y - this.targetPan.y) / this.targetZoom,
    };
    this.targetZoom = Math.min(4, Math.max(0.1, targetZoom));
    this.targetPan = {
      x: cursor.x - before.x * this.targetZoom,
      y: cursor.y - before.y * this.targetZoom,
    };
  }

  worldPointFromClient(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - this.pan.x) / this.zoom,
      y: (clientY - bounds.top - this.pan.y) / this.zoom,
    };
  }

  clientPointFromWorld(x: number, y: number) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: bounds.left + x * this.zoom + this.pan.x,
      y: bounds.top + y * this.zoom + this.pan.y,
    };
  }

  private hitResizeHandle(x: number, y: number): ResizeHandle | undefined {
    const bounds = this.selectionBounds;
    if (!bounds) return undefined;
    const tolerance = 8 / this.zoom;
    const points: [ResizeHandle, number, number][] = [
      ["nw", bounds.x, bounds.y],
      ["n", bounds.x + bounds.width / 2, bounds.y],
      ["ne", bounds.x + bounds.width, bounds.y],
      ["e", bounds.x + bounds.width, bounds.y + bounds.height / 2],
      ["se", bounds.x + bounds.width, bounds.y + bounds.height],
      ["s", bounds.x + bounds.width / 2, bounds.y + bounds.height],
      ["sw", bounds.x, bounds.y + bounds.height],
      ["w", bounds.x, bounds.y + bounds.height / 2],
    ];
    const angle = ((bounds.rotation ?? 0) * Math.PI) / 180;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    return points.find(([, handleX, handleY]) => {
      const dx = handleX - centerX;
      const dy = handleY - centerY;
      const rotatedX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
      const rotatedY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);
      return (
        Math.abs(x - rotatedX) <= tolerance &&
        Math.abs(y - rotatedY) <= tolerance
      );
    })?.[0];
  }
}

function createBuffer(
  device: GPUDevice,
  data: Float32Array,
  usage: GPUBufferUsageFlags,
) {
  const buffer = device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

function measureSceneBounds(rectData: Float32Array) {
  if (rectData.length < FLOATS_PER_RECT)
    return { x: 0, y: 0, width: 1, height: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < rectData.length; offset += FLOATS_PER_RECT) {
    const x = rectData[offset];
    const y = rectData[offset + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + rectData[offset + 2]);
    maxY = Math.max(maxY, y + rectData[offset + 3]);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
