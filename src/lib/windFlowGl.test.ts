import { describe, expect, it } from 'vitest';
import { softwareRenderer } from './windFlowGl';

describe('softwareRenderer', () => {
	it('knows the renderers that run on the processor', () => {
		for (const name of [
			'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
			'Google SwiftShader',
			'llvmpipe (LLVM 15.0.7, 256 bits)',
			'softpipe',
			'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
			'Software Rasterizer'
		])
			expect(softwareRenderer(name), name).toBe(true);
	});

	it('leaves the graphics cards to WebGL', () => {
		for (const name of [
			'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)',
			'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
			'Apple GPU',
			'Mali-G78',
			'Adreno (TM) 740',
			'WebKit WebGL',
			''
		])
			expect(softwareRenderer(name), name).toBe(false);
	});
});
