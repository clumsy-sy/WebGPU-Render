/// <reference types="@webgpu/types" />
declare const __DIRNAME__;

// 声明.wgsl 文件的模块
declare module '*.wgsl' {
  const shader: string;
  export default shader;
}
