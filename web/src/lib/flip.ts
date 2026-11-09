import { animate, useReducedMotion, useMotionValue, useTransform, type ValueAnimationTransition } from 'motion/react';
import { useEffect } from 'react';

const facesFront = (deg: number) => {
  const a = ((deg % 360) + 360) % 360;
  return a <= 90 || a >= 270;
};

/**
 * A card that turns over. `backface-visibility` alone isn't enough on iOS: parts of a face that get their own layer
 * (the chips over the art, the blended illustration) show through mirrored on the other side. So each face is also
 * hidden outright once it has turned away.
 */
export function useFlip(flipped: boolean, transition: ValueAnimationTransition<number>) {
  const reduced = useReducedMotion();
  const rotateY = useMotionValue(0);
  useEffect(() => {
    if (reduced) { rotateY.set(flipped ? 180 : 0); return; }
    const a = animate(rotateY, flipped ? 180 : 0, transition);
    return () => a.stop();
    // The transition is a constant at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, rotateY, reduced]);
  const front = useTransform(rotateY, (r) => (facesFront(r) ? 1 : 0));
  const back = useTransform(rotateY, (r) => (facesFront(r) ? 0 : 1));
  return { rotateY, front, back };
}
