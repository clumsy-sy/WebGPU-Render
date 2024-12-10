// import { WebGPURenderer } from './renderer';
import { FirstTriangle } from './engine/firstTriangle';
import { Cube3D } from './engine/cube3D';
import { CubeMove } from './engine/cubeMove';

enum WebGPUExample  {
  "firstTriangle",
  "cube3D",
  "CubeMove"
}

function generateOptions(): string {
  let options = '<option></option>';
  Object.keys(WebGPUExample).forEach( key => {
    if (isNaN(Number(key))) {
      console.log(key);
      options += `<option value="${key}">${key}</option>`;
    }
  });
  return options;
}



(async () => {
  const select = document.getElementById('example-select') as HTMLSelectElement;
  select.innerHTML = generateOptions();

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
  
    canvas.width = 800;
    canvas.height = 600;
  
    console.log(canvas.width, canvas.height);
  
    let renderer: FirstTriangle | Cube3D;
    if(selectedOption === 'firstTriangle') {
      renderer = new FirstTriangle(canvas);
    } else if(selectedOption === 'cube3D') {
      renderer = new Cube3D(canvas);
    } else if(selectedOption === 'CubeMove') {
      renderer = new CubeMove(canvas);
    } else {
      throw new Error('Invalid option selected.');
    }
  
    try {
      // await renderer.init('./src/shaders.wgsl'); // 将着色器路径传入
      await renderer.initPipeline(); // 将着色器路径传入
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
  });

})();