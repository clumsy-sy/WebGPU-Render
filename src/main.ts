// import { WebGPURenderer } from './renderer';
import { FirstTriangle } from './engine/firstTriangle';
import { Cube3D } from './engine/cube3D';
import { CubeMove } from './engine/cubeMove';
import { DeferredRenderer } from './engine/deferred/main';

enum WebGPUExample  {
  "firstTriangle",
  "cube3D",
  "CubeMove",
  "DeferredRenderer"
}

function generateOptions(): string {
  let options = '';
  Object.keys(WebGPUExample).forEach( key => {
    if (isNaN(Number(key))) {
      console.log(key);
      options += `<option value="${key}">${key}</option>`;
    }
  });
  return options;
}

let frameCount = 0;

(async () => {
  const select = document.getElementById('example-select') as HTMLSelectElement;
  select.innerHTML = generateOptions();

  let renderer: FirstTriangle | Cube3D | CubeMove | DeferredRenderer | null = null;
  
  select.addEventListener('change', async (event) => {
    const selectedOption = (event.target as HTMLSelectElement).value;
    console.log('Selected option:', selectedOption);
    const canvas = document.getElementById('webgpu-canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found.');
    }
  
    // 设置 Canvas 尺寸
    // canvas.width = window.innerWidth;
    // canvas.height = window.innerHeight;
  
    // canvas.width = 1980;
    // canvas.height = 1080;
    canvas.width = 800;
    canvas.height = 600;
  
    console.log(canvas.width, canvas.height);

    // 销毁之前的渲染器
    if(renderer !== null) {
      renderer.destory();
    }
  
    if(selectedOption === 'firstTriangle') {
      renderer = new FirstTriangle(canvas);
    } else if(selectedOption === 'cube3D') {
      renderer = new Cube3D(canvas);
    } else if(selectedOption === 'CubeMove') {
      renderer = new CubeMove(canvas);
    } else if(selectedOption === 'DeferredRenderer') {
      renderer = new DeferredRenderer(canvas);
    } else {
      throw new Error('Invalid option selected.');
    }

    frameCount = 0;
  
    try {

      await renderer!.initPipeline(); // 将着色器路径传入
      console.log('WebGPU initialized successfully.');
  
      // 开始渲染

      function frame() {
        renderer!.render();
        frameCount += 1;
        if (frameCount > 1000) return;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
    }
  });

})();