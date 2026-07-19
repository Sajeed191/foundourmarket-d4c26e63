/**
 * Floating Widgets Collision System v1.0
 *
 * Small pub/sub registry every fixed floating widget (Live Chat orb, Admin
 * floating toolbar, and any future one) opts into. Higher-priority widgets
 * keep their position; lower-priority widgets query this module for the
 * additional vertical offset they must apply to avoid overlap on the same
 * edge (16px minimum gap).
 *
 * Pure math + pub/sub. No DOM, no timers, no polling. Callers re-apply
 * their own `transform` when they receive a change event.
 */

export type FloatingSide = "left" | "right";

export type FloatingEntry = {
  /** 1 = highest (Live Chat). Lower priority widgets shift out of the way. */
  priority: number;
  side: FloatingSide;
  width: number;
  height: number;
};

const GAP = 16;

const entries = new Map<string, FloatingEntry>();
const subs = new Set<() => void>();
let chatActive = false;
let footerLift = 0;
let contextHidden = false;


function emit() {
  subs.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

export function subscribeFloating(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function registerFloating(id: string, entry: FloatingEntry): () => void {
  entries.set(id, entry);
  emit();
  return () => {
    entries.delete(id);
    emit();
  };
}

export function updateFloating(id: string, patch: Partial<FloatingEntry>): void {
  const cur = entries.get(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  if (
    next.priority === cur.priority &&
    next.side === cur.side &&
    next.width === cur.width &&
    next.height === cur.height
  ) return;
  entries.set(id, next);
  emit();
}

/**
 * Vertical offset (positive pixels to move UP) this widget must apply so it
 * clears every higher-priority widget currently docked on the same side.
 * Never negative, never returns > viewport height.
 */
export function getStackOffset(id: string): number {
  const self = entries.get(id);
  if (!self) return 0;
  let offset = 0;
  entries.forEach((e, key) => {
    if (key === id) return;
    if (e.side !== self.side) return;
    if (e.priority < self.priority) offset += e.height + GAP;
  });
  return offset;
}

/**
 * Live Chat sets this to true while its chat surface / quick-actions menu is
 * open. Lower-priority widgets can subscribe and visually recede
 * (opacity/scale) while it's true — never hidden.
 */
export function setChatActive(v: boolean): void {
  if (chatActive === v) return;
  chatActive = v;
  emit();
}

export function isChatActive(): boolean {
  return chatActive;
}

/**
 * Extra vertical offset (positive px = move UP) every floating widget should
 * apply so it clears the site footer / newsletter block by ≥24px. Updated by
 * `<FloatingContextObserver />` from the site footer's viewport rect.
 */
export function setFooterLift(v: number): void {
  const next = Math.max(0, Math.round(v));
  if (Math.abs(next - footerLift) < 1) return;
  footerLift = next;
  emit();
}
export function getFooterLift(): number {
  return footerLift;
}

/**
 * True while an immersive surface (native fullscreen, image zoom, video
 * fullscreen) is active. Widgets fully hide (opacity 0 + pointer-events none)
 * without unmounting, so they restore instantly when the user exits.
 */
export function setContextHidden(v: boolean): void {
  if (contextHidden === v) return;
  contextHidden = v;
  emit();
}
export function isContextHidden(): boolean {
  return contextHidden;
}

