import { WebGPURenderer } from './renderer';

(async () => {
  const canvas = document.getElementById('webgpu-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found.');
  }

  // 设置 Canvas 尺寸
  // canvas.width = window.innerWidth;
  // canvas.height = window.innerHeight;

  canvas.width = 800;
  canvas.height = 600;

  console.log(canvas.width, canvas.height);

  const renderer = new WebGPURenderer(canvas);

  try {
    await renderer.init('./src/shaders.wgsl'); // 将着色器路径传入
    console.log('WebGPU initialized successfully.');

    // 开始渲染
    function frame() {
      renderer.render();
      requestAnimationFrame(frame);
    }
    frame();
  } catch (error) {
    console.error('Failed to initialize WebGPU:', error);
  }
})();