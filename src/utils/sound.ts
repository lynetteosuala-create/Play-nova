class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.2,
    delaySec = 0,
    endFreq?: number
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    const peak = Math.max(0.001, gainPeak * this.volume);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.tone(540, 0.06, 'triangle', 0.14, 0, 340);
  }

  playSelect() {
    this.tone(420, 0.08, 'sine', 0.16, 0, 620);
  }

  playTick() {
    this.tone(680, 0.05, 'square', 0.08);
  }

  playWin() {
    this.tone(523.25, 0.14, 'triangle', 0.18, 0);
    this.tone(659.25, 0.14, 'triangle', 0.18, 0.08);
    this.tone(783.99, 0.26, 'triangle', 0.2, 0.16);
  }

  playDraw() {
    this.tone(440, 0.14, 'sine', 0.15, 0);
    this.tone(440, 0.18, 'sine', 0.15, 0.14);
  }

  playLoss() {
    this.tone(330, 0.16, 'sawtooth', 0.11, 0, 240);
    this.tone(220, 0.26, 'sawtooth', 0.11, 0.14, 150);
  }

  playAchievement() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.tone(f, 0.2, 'triangle', 0.18, idx * 0.07);
    });
  }

  playReward() {
    this.tone(740, 0.1, 'sine', 0.16, 0);
    this.tone(987.77, 0.2, 'sine', 0.18, 0.07);
  }
}

export const soundFx = new SoundManager();
