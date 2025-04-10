import { mat4, vec3 } from 'wgpu-matrix';
import { GUI } from 'dat.gui';
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from '../../resources/meshes/cube';
import basicVertWGSL from '../shaders/basic.vert.wgsl';
import vertexPositionColorWGSL from '../shaders/vertexPositionColor.frag.wgsl';
import { ArcballCamera, WASDCamera } from './camera';
import { createInputHandler } from './input';
import { BaseRenderer } from './base';


const params: { type: 'arcball' | 'WASD' } = {
  type: 'arcball',
};

let lastFrameMS = Date.now();

export class CubeMove extends BaseRenderer {
  devicePixelRatio = window.devicePixelRatio;
  verticesBuffer: GPUBuffer | null = null;
  uniformBuffer: GPUBuffer | null = null;
  uniformBindGroup: GPUBindGroup | null = null;
  depthTexture: GPUTexture | null = null;
  pipeline: GPURenderPipeline | null = null;
  renderPassDescriptor: GPURenderPassDescriptor | null = null;
  // 投影矩阵
  projectionMatrix: Float32Array;
  // 模型视图投影矩阵
  modelViewProjectionMatrix: Float32Array;

  inputHandler: ReturnType<typeof createInputHandler>;
  static initialCameraPosition = vec3.create(3, 2, 5);
  static cameras = {
    arcball: new ArcballCamera({ position: CubeMove.initialCameraPosition }),
    WASD: new WASDCamera({ position: CubeMove.initialCameraPosition }),
  };
  gui: GUI;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.canvas.width = canvas.clientWidth * devicePixelRatio;
    this.canvas.height = canvas.clientHeight * devicePixelRatio;
    const aspect = this.canvas.width / this.canvas.height;
    this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
    this.modelViewProjectionMatrix = mat4.create();

    console.log(basicVertWGSL);
    console.log(vertexPositionColorWGSL);

    this.inputHandler = createInputHandler(window, canvas);
    
    this.gui = new GUI();

    // Callback handler for camera mode
    let oldCameraType = params.type;
    this.gui.add(params, 'type', ['arcball', 'WASD']).onChange(() => {
      // Copy the camera matrix from old to new
      const newCameraType = params.type;
      CubeMove.cameras[newCameraType].matrix = CubeMove.cameras[oldCameraType].matrix;
      oldCameraType = newCameraType;
    });

  }
  public async initPipeline() {
    try {
      await super.check();
    } catch (error) {
      console.error('Error during initialization:', error);
      return;
    }
    if(!this.device ||!this.context) {
      throw new Error('Device or context is not initialized.');
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // Create a vertex buffer from the cube data.
    this.verticesBuffer = this.device.createBuffer({
      size: cubeVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.verticesBuffer.getMappedRange()).set(cubeVertexArray);
    this.verticesBuffer.unmap();

    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({
          code: basicVertWGSL,
        }),
        buffers: [
        {
          arrayStride: cubeVertexSize,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: cubePositionOffset,
              format: 'float32x4',
            },
            {
              // uv
              shaderLocation: 1,
              offset: cubeUVOffset,
              format: 'float32x2',
            },
          ],
        },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: vertexPositionColorWGSL,
        }),
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
      },

      // Enable depth testing so that the fragment closest to the camera
      // is rendered in front.
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

      this.depthTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

  const uniformBufferSize = 4 * 16; // 4x4 matrix
  this.uniformBuffer = this.device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  this.uniformBindGroup = this.device.createBindGroup({
    layout: this.pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: this.uniformBuffer,
        },
      },
    ],
  });

}
  public render() {
    if (!this.device || 
      !this.context || 
      !this.pipeline || 
      !this.verticesBuffer ||
      !this.uniformBuffer ||
      !this.depthTexture ||
      !this.uniformBindGroup) {
        console.error(this.device);
        console.error(this.context);
        console.error(this.pipeline);
        console.error(this.verticesBuffer);
        console.error(this.uniformBuffer);
        console.error(this.depthTexture);
        console.error(this.uniformBindGroup);

        throw new Error('One or more resources are not initialized.');
    }

    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    lastFrameMS = now;

    const transformationMatrix = this.getModelViewProjectionMatrix(deltaTime);
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      transformationMatrix.buffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength
    );
    const textureView = this.context.getCurrentTexture().createView();
    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView, // Assigned later
          clearValue: [0.5, 0.5, 0.5, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
  
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.uniformBindGroup);
    passEncoder.setVertexBuffer(0, this.verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  public afterRender() {
  }


  getModelViewProjectionMatrix(deltaTime: number) {
    const camera = CubeMove.cameras[params.type];
    const viewMatrix = camera.update(deltaTime, this.inputHandler());
    mat4.multiply(this.projectionMatrix, viewMatrix, this.modelViewProjectionMatrix);
    return this.modelViewProjectionMatrix;
  }

  public destory(): void {
    this.gui.destroy();
  }
}