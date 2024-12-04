import {BaseRenderer} from "./base";
import firstTriangle from "../shaders/firstTriangle.wgsl";

export class FirstTriangle extends BaseRenderer {
  pipeline: GPURenderPipeline | null = null;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  async initPipeline() {
    try {
      await super.check();
    } catch (error) {
      console.error('Error during initialization:', error);
      return;
    }

    if (!this.device ||!this.context) {
      throw new Error('Device or context is not initialized.');
    }
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'opaque',
    });

    if (!this.device) throw new Error('Device is not initialized.');

    const shaderModule = this.device.createShaderModule({
      code: firstTriangle,
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
        targets: [{ format: presentationFormat }],
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

  afterRender() {

  }
  
}