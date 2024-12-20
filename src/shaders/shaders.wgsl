// 顶点着色器
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.5),     // 顶点 1
        vec2<f32>(-0.5, -0.5),   // 顶点 2
        vec2<f32>(0.5, -0.5)     // 顶点 3
    );
    let position = positions[vertexIndex];
    return vec4<f32>(position, 0.0, 1.0);
}

// 片段着色器
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0); // 红色
}