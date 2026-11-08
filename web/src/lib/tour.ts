import type { TourTarget } from './welcome';

// After the welcome, the camera screen's buttons are lit one at a time, like a game tutorial.
// The camera (and the browser's or iOS's permission prompt) only starts after the last step, so the prompt comes
// right after "let's take a photo" instead of appearing before people know what the app is for.
// While it runs, Home shows its web-drawn camera buttons (even on iOS), so the lit one can be measured exactly and
// the others sit under the dark layer, out of reach.
export const STEPS: { target: TourTarget; title: string; body: string }[] = [
  { target: 'shutter', title: 'カメラで撮る', body: '調べたいモノをカメラに写して、このボタンで撮ります。' },
  { target: 'gallery', title: '写真から調べる', body: 'すでに撮った写真やスクショからでも、写っているモノを見つけられます。' },
  { target: 'zukan', title: '図鑑に集める', body: '調べたモノはカードにして、ここにためていけます。' },
  // Guests can start right away; signing in is introduced here instead of being asked for up front.
  { target: 'account', title: 'ログイン', body: 'ログインすると、もっとたくさん調べられて、図鑑をほかの端末でも開けるようになります。' },
  { target: 'help', title: '困ったときは', body: 'この説明は、ここからいつでも見直せます。' },
  { target: 'shutter', title: '気になるモノを撮ってみよう', body: 'では、さっそくカメラを持って冒険に出かけましょう。' },
];

// Pages in the whole tutorial: the welcome card first, then one per lit button.
export const TOUR_PAGES = STEPS.length + 1;
