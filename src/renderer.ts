export class WebGPURenderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(shaderPath: string) {
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

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'opaque',
    });

    await this.initPipeline(shaderPath, presentationFormat);
  }

  private async initPipeline(shaderPath: string, format: GPUTextureFormat) {
    if (!this.device) throw new Error('Device is not initialized.');

    // 动态加载着色器文件
    const shaderCode = await fetch(shaderPath).then((res) => res.text());

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }

  render() {
    if (!this.device || !this.context || !this.pipeline) {
      throw new Error('Renderer is not initialized.');
    }

    const textureView = this.context.getCurrentTexture().createView();

    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: [0.0, 0.0, 0.0, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.draw(3); // 绘制三角形
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}