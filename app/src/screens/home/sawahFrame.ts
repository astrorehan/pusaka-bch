// The two compositions of the home hero. The live scene and its poster crop the same base frame,
// exactly as object-fit: cover does, so the handover from still to 3D does not move a pixel.

/** From this width the copy sits beside the bloom; below it the copy sits above. */
export const WIDE_QUERY = '(min-width: 900px)';

export interface HeroFrame {
  /** width / height of the full frame */
  aspect: number;
  /** poster pixels */
  width: number;
  height: number;
  /** which part survives the crop, as object-position fractions */
  anchorX: number;
  anchorY: number;
}

export const FRAMES: { wide: HeroFrame; tall: HeroFrame } = {
  wide: { aspect: 2.4, width: 1920, height: 800, anchorX: 0.5, anchorY: 0.5 },
  tall: { aspect: 1.25, width: 1000, height: 800, anchorX: 0.5, anchorY: 0.4 },
};
