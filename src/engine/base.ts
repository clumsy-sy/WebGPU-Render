export abstract class BaseRenderer {
  public canvas: HTMLCanvasElement;
  public device: GPUDevice | null = null;
  public context: GPUCanvasContext | null = null;
  public pipeline: GPURenderPipeline | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async check() {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in your browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get GPU adapter.');
    }

    this.device = await adapter.requestDevice();
    if (!this.device) {
      throw new Error('Failed to get GPU device.');
    }

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error('Failed to get WebGPU canvas context.');
    }
  }

  public abstract initPipeline(): Promise<void> | void;

  public abstract render(): void;

  public abstract afterRender(): void;
}