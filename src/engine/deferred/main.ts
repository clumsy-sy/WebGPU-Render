import { mat4, vec3, vec4 } from 'wgpu-matrix';
import { GUI } from 'dat.gui';
import { mesh } from './module/stanfordDragon';

import lightUpdate from './shaders/lightUpdate.wgsl';
import vertexWriteGBuffers from './shaders/vertexWriteGBuffers.wgsl';
import fragmentWriteGBuffers from './shaders/fragmentWriteGBuffers.wgsl';
import vertexTextureQuad from './shaders/vertexTextureQuad.wgsl';
import fragmentGBuffersDebugView from './shaders/fragmentGBuffersDebugView.wgsl';
import fragmentDeferredRendering from './shaders/fragmentDeferredRendering.wgsl';

export class DeferredRenderer {
  // 基础对象
  public canvas: HTMLCanvasElement;
  public device: GPUDevice | null = null;
  public context: GPUCanvasContext | null = null;
  public presentationFormat: GPUTextureFormat | null = null;

  // WebGPU 相关
  public vertexBuffer: GPUBuffer | null = null;
  public indexBuffer: GPUBuffer | null = null;
  public modelUniformBuffer: GPUBuffer | null = null;
  public cameraUniformBuffer: GPUBuffer | null = null;
  public configUniformBuffer: GPUBuffer | null = null;
  public lightsBuffer: GPUBuffer | null = null;
  public lightExtentBuffer: GPUBuffer | null = null;

  public gBufferTexture: GPUTexture[] = [];
  public gBufferTextureViews: GPUTextureView[] = [];

  public gBufferTexturesBindGroupLayout: GPUBindGroupLayout | null = null;
  public lightsBufferBindGroupLayout: GPUBindGroupLayout | null = null;
  public sceneUniformBindGroup: GPUBindGroup | null = null;
  public gBufferTexturesBindGroup: GPUBindGroup | null = null; 
  public lightsBufferBindGroup: GPUBindGroup | null = null; 
  public lightsBufferComputeBindGroup: GPUBindGroup | null = null; 

  public writeGBufferPassDescriptor: GPURenderPassDescriptor | null = null;
  public textureQuadPassDescriptor: GPURenderPassDescriptor | null = null;
  
  public writeGBuffersPipeline: GPURenderPipeline | null = null;
  public deferredRenderPipeline: GPURenderPipeline | null = null;
  public lightUpdateComputePipeline: GPUComputePipeline | null = null;
  public gBuffersDebugViewPipeline: GPURenderPipeline | null = null;


  // 参数
  // 光照的最大数量及范围
  private kMaxNumLights = 1024;
  private lightExtentMin = vec3.fromValues(-50, -30, -50);
  private lightExtentMax = vec3.fromValues(50, 50, 50);
  
  public aspect = 1.0;
  public kVertexStride = 8;
  public indexCount = 0;
  public settings = {
    mode: 'rendering',
    numLights: 128,
  };
  public eyePosition = vec3.fromValues(0, 50, -100);
  public upVector = vec3.fromValues(0, 1, 0);
  public origin = vec3.fromValues(0, 0, 0);
  public projectionMatrix = mat4.create();

  // UI
  public gui = new GUI();

  // 检查是否支持 WebGPU
  private async check() {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in your browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get GPU adapter.');
    }

    this.device = await adapter.requestDevice();

    if(!this.device) {
      throw new Error('Failed to get GPU device.');
    }

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    if(!this.context) {
      throw new Error('Failed to get WebGPU canvas context.');
    }
  }
  /**
   * @brief 构造函数
   * @param canvas 画布
   */
  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // 设置 canvas 的宽高
    const devicePixelRatio = window.devicePixelRatio;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    this.aspect = this.canvas.width / this.canvas.height;
    console.log("devicePixelRatio = ", devicePixelRatio);
    console.log("canvas.width = ", this.canvas.width);
    console.log("canvas.height = ", this.canvas.height);
    console.log("this.canvas.clientWidth = ", this.canvas.clientWidth);
    console.log("this.canvas.clientHeight = ", this.canvas.clientHeight);
  }

  /**
   * 初始化上下文
   */
  private confContext() {
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context!.configure({
      device: this.device!,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
    });
  }

  /**
   * 创建 vertex buffer
   */
  private createVertexBuffer() {
    /**
     * {
     *   position: vec3,
     *   normal: vec3,
     *   uv: vec2
     * }
     */
    this.kVertexStride = 8;
    this.vertexBuffer = this.device!.createBuffer({
      size: mesh.positions.length * this.kVertexStride * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    let mapping_vertex = new Float32Array(this.vertexBuffer.getMappedRange());
    for (let i = 0; i < mesh.positions.length; ++i) {
      mapping_vertex.set(mesh.positions[i], this.kVertexStride * i);
      mapping_vertex.set(mesh.normals[i], this.kVertexStride * i + 3);
      mapping_vertex.set(mesh.uvs[i], this.kVertexStride * i + 6);
    }
    this.vertexBuffer.unmap();
  }

  
  /**
   * 创建 index buffer
   */
  private createIndexBuffer() {
    this.indexCount = mesh.triangles.length * 3;
    this.indexBuffer = this.device!.createBuffer({
      size: this.indexCount * Uint16Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    let mapping_index = new Uint16Array(this.indexBuffer.getMappedRange());
    for (let i = 0; i < mesh.triangles.length; ++i) {
      mapping_index.set(mesh.triangles[i], 3 * i);
    }
    this.indexBuffer.unmap();
  }

  /**
   * 创建 GBuffer texture render targets
   * GPUTextureUsage.RENDER_ATTACHMENT 表示它可以作为渲染目标
   * GPUTextureUsage.TEXTURE_BINDING 表示它可以被绑定到着色器中
   */
  private createGBufferTexture() {
    // 颜色信息
    const gBufferTexture2DFloat16 = this.device!.createTexture({
      size: [this.canvas.width, this.canvas.height],
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba16float',
    });
    // 反照率信息
    const gBufferTextureAlbedo = this.device!.createTexture({
      size: [this.canvas.width, this.canvas.height],
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'bgra8unorm',
    });
    // 深度信息
    const depthTexture = this.device!.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.gBufferTexture = [
      gBufferTexture2DFloat16,
      gBufferTextureAlbedo,
      depthTexture,
    ];
    // 创建纹理视图
    this.gBufferTextureViews = [
      gBufferTexture2DFloat16.createView(),
      gBufferTextureAlbedo.createView(),
      depthTexture.createView(),
    ];
  }

  /**
   * 创建 GBuffer pipeline
   */
  private createGBufferPipeline() {
    this.writeGBuffersPipeline = this.device!.createRenderPipeline({
      // 自动推断布局
      layout: 'auto', 
      // 顶点部分
      vertex: {
        module: this.device!.createShaderModule({
          code: vertexWriteGBuffers,
        }),
        // 定义了顶点的属性，包括位置、法线和 UV 坐标
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * this.kVertexStride,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
              {
                // normal
                shaderLocation: 1,
                offset: Float32Array.BYTES_PER_ELEMENT * 3,
                format: 'float32x3',
              },
              {
                // uv
                shaderLocation: 2,
                offset: Float32Array.BYTES_PER_ELEMENT * 6,
                format: 'float32x2',
              },
            ],
          }
        ],
      },
      // 片元部分
      fragment: {
        module: this.device!.createShaderModule({
          code: fragmentWriteGBuffers,
        }),
        // 输出目标格式
        targets: [
          // normal
          { format: 'rgba16float' },
          // albedo
          { format: 'bgra8unorm' },
        ],
      },
      // 深度缓冲：
      // 启用深度写入，使用 depth24plus 格式进行深度比较，确保正确的深度测试
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      // 图元类型为三角形
      // 剔除模式为背面剔除
      primitive : {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });
  }

  /**
   * 创建纹理绑定组布局
   */
  private createGBufferTexturesBindGroup() {
    // 创建 gbuffer 纹理绑定组布局
    this.gBufferTexturesBindGroupLayout = this.device!.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'unfilterable-float',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'unfilterable-float',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'depth',
          },
        },
      ],
    });
    // 创建 lights 绑定组布局
    this.lightsBufferBindGroupLayout = this.device!.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          buffer: {
            type: 'read-only-storage',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform',
          },
        },
      ],
    });
    // 创建 gbuffer 纹理绑定组
    this.gBufferTexturesBindGroup = this.device!.createBindGroup({
      layout: this.gBufferTexturesBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.gBufferTextureViews[0],
        },
        {
          binding: 1,
          resource: this.gBufferTextureViews[1],
        },
        {
          binding: 2,
          resource: this.gBufferTextureViews[2],
        },
      ],
    });
  }

  /**
   * 创建 GBuffer debug view pipeline
   */
  private createGBufferDebugViewPipeline() {
    this.gBuffersDebugViewPipeline = this.device!.createRenderPipeline({
      layout: this.device!.createPipelineLayout({
        bindGroupLayouts: [this.gBufferTexturesBindGroupLayout],
      }),
      vertex: {
        module: this.device!.createShaderModule({
          code: vertexTextureQuad,
        }),
      },
      fragment: {
        module: this.device!.createShaderModule({
          code: fragmentGBuffersDebugView,
        }),
        targets: [
          {
            format: this.presentationFormat!,
          },
        ],
        constants: {
          canvasSizeWidth: this.canvas.width,
          canvasSizeHeight: this.canvas.height,
        },
      },
      primitive : {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });
  }

  /**
   * 创建 deferred render pipeline
   */
  private createDeferredRenderPipeline() {
    this.deferredRenderPipeline = this.device!.createRenderPipeline({
      layout: this.device!.createPipelineLayout({
        bindGroupLayouts: [
          this.gBufferTexturesBindGroupLayout,
          this.lightsBufferBindGroupLayout,
        ],
      }),
      vertex: {
        module: this.device!.createShaderModule({
          code: vertexTextureQuad,
        }),
      },
      fragment: {
        module: this.device!.createShaderModule({
          code: fragmentDeferredRendering,
        }),
        targets: [
          {
            format: this.presentationFormat!,
          },
        ],
      },
      primitive : {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });
  }

  /**
   * 创建 pass descriptor
   */
  private createPassDescriptors() {
    this.writeGBufferPassDescriptor = {
      colorAttachments: [
        {
          view: this.gBufferTextureViews[0],
          clearValue: [0.0, 0.0, 1.0, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.gBufferTextureViews[1],
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.gBufferTexture[2].createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    this.textureQuadPassDescriptor = {
      colorAttachments: [
        {
          // view is acquired and set in render loop.
          view: undefined!,
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
  }

  /**
   * 创建 light buffer
   */
  private createLightBuffer() {
    this.configUniformBuffer = (() => {
      const buffer = this.device!.createBuffer({
        size: Uint32Array.BYTES_PER_ELEMENT,
        mappedAtCreation: true,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      new Uint32Array(buffer.getMappedRange())[0] = this.settings.numLights;
      buffer.unmap();
      return buffer;
    })();

    // Lights data are uploaded in a storage buffer
    // which could be updated/culled/etc. with a compute shader
    const extent = vec3.sub(this.lightExtentMax, this.lightExtentMin);
    const lightDataStride = 8;
    const bufferSizeInByte =
      Float32Array.BYTES_PER_ELEMENT * lightDataStride * this.kMaxNumLights;
    this.lightsBuffer = this.device!.createBuffer({
      size: bufferSizeInByte,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });

    // We randomaly populate lights randomly in a box range
    // And simply move them along y-axis per frame to show they are
    // dynamic lightings
    const lightData = new Float32Array(this.lightsBuffer.getMappedRange());
    const tmpVec4 = vec4.create();
    let offset = 0;
    for (let i = 0; i < this.kMaxNumLights; i++) {
      offset = lightDataStride * i;
      // position
      for (let i = 0; i < 3; i++) {
        tmpVec4[i] = Math.random() * extent[i] + this.lightExtentMin[i];
      }
      tmpVec4[3] = 1;
      lightData.set(tmpVec4, offset);
      // color
      tmpVec4[0] = Math.random() * 2;
      tmpVec4[1] = Math.random() * 2;
      tmpVec4[2] = Math.random() * 2;
      // radius
      tmpVec4[3] = 20.0;
      lightData.set(tmpVec4, offset + 4);
    }
    this.lightsBuffer.unmap();

    this.lightExtentBuffer = this.device!.createBuffer({
      size: 4 * 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const lightExtentData = new Float32Array(8);
    lightExtentData.set(this.lightExtentMin, 0);
    lightExtentData.set(this.lightExtentMax, 4);
    this.device!.queue.writeBuffer(
      this.lightExtentBuffer,
      0,
      lightExtentData.buffer,
      lightExtentData.byteOffset,
      lightExtentData.byteLength
    );
  }

  /**
   * 设置 GUI
   */
  private setGUI(){
    this.gui.add(this.settings, 'mode', ['rendering', 'gBuffers view']);
    this.gui
      .add(this.settings, 'numLights', 1, this.kMaxNumLights)
      .step(1)
      .onChange(() => {
        if(!this.device){
          throw new Error('Failed in initGUI');
        }
        this.device.queue.writeBuffer(
          this.configUniformBuffer!,
          0,
          new Uint32Array([this.settings.numLights])
        );
      });
  }

  /**
   * 创建 uniform buffer 和 bind group
   */
  private createUniformBufferAndBindGroup() {
    this.modelUniformBuffer = this.device!.createBuffer({
      size: 4 * 16 * 2, // two 4x4 matrix
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cameraUniformBuffer = this.device!.createBuffer({
      size: 4 * 16 * 2, // two 4x4 matrix
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sceneUniformBindGroup = this.device!.createBindGroup({
      layout: this.writeGBuffersPipeline!.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.modelUniformBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.cameraUniformBuffer,
          },
        },
      ],
    });
  }

  private createLightUpdateComputePipeline() {
    this.lightUpdateComputePipeline = this.device!.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device!.createShaderModule({
          code: lightUpdate,
        }),
      },
    });
  }

  private createLightBufferBindGroup() {
    this.lightsBufferBindGroup = this.device!.createBindGroup({
      layout: this.lightsBufferBindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.lightsBuffer!,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.configUniformBuffer!,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.cameraUniformBuffer!,
          },
        },
      ],
    });
    this.lightsBufferComputeBindGroup = this.device!.createBindGroup({
      layout: this.lightUpdateComputePipeline!.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.lightsBuffer!,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.configUniformBuffer!,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.lightExtentBuffer!,
          },
        },
      ],
    });
  }

  private matrixInit() {
    this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, this.aspect, 1, 2000.0);

    // Move the model so it's centered.
    const modelMatrix = mat4.translation([0, -45, 0]);
    this.device!.queue.writeBuffer(this.modelUniformBuffer!, 0, modelMatrix);
    const invertTransposeModelMatrix = mat4.invert(modelMatrix);
    mat4.transpose(invertTransposeModelMatrix, invertTransposeModelMatrix);
    const normalModelData = invertTransposeModelMatrix;
    this.device!.queue.writeBuffer(
      this.modelUniformBuffer!,
      64,
      normalModelData.buffer,
      normalModelData.byteOffset,
      normalModelData.byteLength
    );
  }


  public async initPipeline() {
    try {
      await this.check();
    } catch (error) {
      console.error('Error during initialization:', error);
      return;
    }

    this.confContext();

    // vertex prepare
    
    this.createVertexBuffer();
    this.createIndexBuffer();
    this.createGBufferTexture();
    this.createGBufferPipeline();
    this.createGBufferTexturesBindGroup();
    this.createGBufferDebugViewPipeline();
    this.createDeferredRenderPipeline();
    this.createPassDescriptors();
    this.createLightBuffer();

    this.setGUI();

    this.createUniformBufferAndBindGroup();
    this.createLightUpdateComputePipeline();
    this.createLightBufferBindGroup();

    // Scene matrices
    this.matrixInit()
  }

  // Rotates the camera around the origin based on time.
  public getCameraViewProjMatrix() {
    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(this.origin), rad);
    const rotatedEyePosition = vec3.transformMat4(this.eyePosition, rotation);

    const viewMatrix = mat4.lookAt(rotatedEyePosition, this.origin, this.upVector);

    return mat4.multiply(this.projectionMatrix, viewMatrix);
  }

  private updateQuadPassDescriptor() {
    this.textureQuadPassDescriptor = {
      colorAttachments: [
        {
          // view is acquired and set in render loop.
          view: this.context!.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
  }

  public render() {
    // 更新相机矩阵
    const cameraViewProj = this.getCameraViewProjMatrix();
    this.device!.queue.writeBuffer(
      this.cameraUniformBuffer!,
      0,
      cameraViewProj.buffer,
      cameraViewProj.byteOffset,
      cameraViewProj.byteLength
    );
    // 更新相机逆矩阵
    const cameraInvViewProj = mat4.invert(cameraViewProj);
    this.device!.queue.writeBuffer(
      this.cameraUniformBuffer!,
      64,
      cameraInvViewProj.buffer,
      cameraInvViewProj.byteOffset,
      cameraInvViewProj.byteLength
    );
    // 创建 command encoder
    const commandEncoder = this.device!.createCommandEncoder();
    {
      // Write position, normal, albedo etc. data to gBuffers
      const gBufferPass = commandEncoder.beginRenderPass(
        this.writeGBufferPassDescriptor!
      );
      gBufferPass.setPipeline(this.writeGBuffersPipeline!);
      gBufferPass.setBindGroup(0, this.sceneUniformBindGroup);
      gBufferPass.setVertexBuffer(0, this.vertexBuffer);
      gBufferPass.setIndexBuffer(this.indexBuffer!, 'uint16');
      gBufferPass.drawIndexed(this.indexCount);
      gBufferPass.end();
    }
    {
      // Update lights position
      const lightPass = commandEncoder.beginComputePass();
      lightPass.setPipeline(this.lightUpdateComputePipeline!);
      lightPass.setBindGroup(0, this.lightsBufferComputeBindGroup);
      lightPass.dispatchWorkgroups(Math.ceil(this.kMaxNumLights / 64));
      lightPass.end();
    }
    {
      if (this.settings.mode === 'gBuffers view') {
        // GBuffers debug view
        // Left: depth
        // Middle: normal
        // Right: albedo (use uv to mimic a checkerboard texture)
        this.updateQuadPassDescriptor();
        const debugViewPass = commandEncoder.beginRenderPass(
          this.textureQuadPassDescriptor!
        );
        debugViewPass.setPipeline(this.gBuffersDebugViewPipeline!);
        debugViewPass.setBindGroup(0, this.gBufferTexturesBindGroup);
        debugViewPass.draw(6);
        debugViewPass.end();
      } else {
        // Deferred rendering
        this.updateQuadPassDescriptor();
        const deferredRenderingPass = commandEncoder.beginRenderPass(
          this.textureQuadPassDescriptor!
        );
        deferredRenderingPass.setPipeline(this.deferredRenderPipeline!);
        deferredRenderingPass.setBindGroup(0, this.gBufferTexturesBindGroup);
        deferredRenderingPass.setBindGroup(1, this.lightsBufferBindGroup);
        deferredRenderingPass.draw(6);
        deferredRenderingPass.end();
      }
    }
    this.device!.queue.submit([commandEncoder.finish()]);
  }

  public destory(){
    this.gui.destroy();
  }

}


