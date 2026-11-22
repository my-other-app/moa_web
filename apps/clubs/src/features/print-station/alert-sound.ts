/**
 * A short two-tone beep from the Web Audio API, for a card that did not print. It needs no sound
 * file. Chrome only lets a page make sound without a click when started with
 * --autoplay-policy=no-user-gesture-required (the setup panel lists it); without it, the visual
 * alert still shows.
 */
export function playAlertSound(): boolean {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    void ctx.resume?.();
    const beep = (freq: number, start: number, length: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + length + 0.02);
    };
    beep(880, 0, 0.25);
    beep(660, 0.3, 0.25);
    beep(880, 0.6, 0.25);
    setTimeout(() => void ctx.close?.(), 1200);
    return true;
  } catch {
    return false;
  }
}
