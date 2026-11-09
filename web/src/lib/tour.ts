import type { TourTarget } from './welcome';

// After the welcome, the camera screen's buttons are lit one at a time, like a game tutorial.
// The camera (and the browser's or iOS's permission prompt) only starts after the last step, so the prompt comes
// right after "let's take a photo" instead of appearing before people know what the app is for.
// While it runs, Home shows its web-drawn camera buttons (even on iOS), so the lit one can be measured exactly and
// the others sit under the dark layer, out of reach.
// Titles and bodies carry 漢字《かんじ》 marks for the youngest readers (shown with <KidText>).
export const STEPS: { target: TourTarget; title: string; body: string }[] = [
  { target: 'shutter', title: 'カメラで撮《と》る', body: '調《しら》べたいモノをカメラに写《うつ》して、このボタンで撮《と》ります。' },
  { target: 'gallery', title: '写真《しゃしん》から調《しら》べる', body: 'すでに撮《と》った写真《しゃしん》やスクショからでも、写《うつ》っているモノを見《み》つけられます。' },
  { target: 'zukan', title: '図鑑《ずかん》に集《あつ》める', body: '調《しら》べたモノはカードにして、ここにためていけます。' },
  // Guests can start right away; signing in is introduced here instead of being asked for up front.
  { target: 'account', title: 'ログイン', body: 'ログインすると、もっとたくさん調《しら》べられて、図鑑《ずかん》をほかの端末《たんまつ》でも開《ひら》けるようになります。' },
  { target: 'help', title: '困《こま》ったときは', body: 'この説明《せつめい》は、ここからいつでも見直《みなお》せます。' },
  { target: 'shutter', title: '気《き》になるモノを撮《と》ってみよう', body: 'では、さっそくカメラを持《も》って冒険《ぼうけん》に出《で》かけましょう。' },
];

// Pages in the whole tutorial: the welcome card first, then one per lit button.
export const TOUR_PAGES = STEPS.length + 1;
