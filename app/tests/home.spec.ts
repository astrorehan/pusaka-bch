import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    paddyPressRipples: Set<string>;
  }
}

test.use({
  viewport: { width: 1440, height: 900 },
  colorScheme: "light",
  reducedMotion: "no-preference",
  launchOptions: { args: ["--enable-unsafe-swiftshader"] },
});

test("the paddy responds to a press and follows a held sweep", async ({ page }) => {
  await page.addInitScript(() => {
    // Record the ripples that reach the renderer as the scene moves.
    window.paddyPressRipples = new Set();
    const gl = WebGL2RenderingContext.prototype;
    const rippleUniforms = new WeakSet<WebGLUniformLocation>();
    const getUniformLocation = gl.getUniformLocation;
    gl.getUniformLocation = function (program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (location && name === "uDrops[0]") rippleUniforms.add(location);
      return location;
    };
    const uniform4fv = gl.uniform4fv;
    gl.uniform4fv = function (location, values, ...range) {
      if (location && rippleUniforms.has(location)) {
        const packed = Array.from(values);
        for (let i = 0; i < packed.length; i += 4) {
          const [x, z, , strength] = packed.slice(i, i + 4);
          if (strength > 1) window.paddyPressRipples.add(`${x},${z}`);
        }
      }
      uniform4fv.call(this, location, values, ...range);
    };
  });

  await page.goto("/");
  await expect(page.locator(".flower-stage")).toHaveAttribute("data-scene", "ready", { timeout: 20_000 });
  const rippleCount = () => page.evaluate(() => window.paddyPressRipples.size);

  await page.mouse.move(570, 570);
  await page.mouse.down();
  try {
    await expect.poll(rippleCount).toBe(1);
    await page.mouse.move(834, 570, { steps: 32 });
    await expect.poll(rippleCount).toBeGreaterThanOrEqual(3);
  } finally {
    await page.mouse.up();
  }

  const previous = await rippleCount();
  await page.mouse.move(720, 210);
  await page.mouse.down();
  try {
    await page.mouse.move(690, 600);
    await expect.poll(rippleCount).toBeGreaterThan(previous);
  } finally {
    await page.mouse.up();
  }
});
