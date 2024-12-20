/**
 * @param message 
 * 
 * @description 打印webgpu的日志
 */
function logWebGPUMessages(message:String) {
  console.log("[webgpu]" + message);
}

function checkNullUndefined(...variables: any[]) {
  for(const variable of variables) {
    if (!variable) {
      throw new Error(`${variable} is null or undefined`);
    }
  }
}

export { logWebGPUMessages, checkNullUndefined };