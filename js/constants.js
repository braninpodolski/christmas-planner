/* =========================================================
   State
   ========================================================= */
export const KEY = 'xmas-planner-v1'; // storage key kept so existing lists keep loading
// Generic labels (used for filters and the overview); each gift shows labels for its own kind.
export const STATUSES = [
  { id: 'idea', label: 'Ideas' },
  { id: 'started', label: 'In progress' },
  { id: 'have', label: 'In hand' },
  { id: 'wrapped', label: 'Wrapped' },
];
export const KIND_STEPS = {
  buy: ['Idea', 'Ordered', 'In hand', 'Wrapped'],
  make: ['Idea', 'Making', 'Finished', 'Wrapped'],
};
export const stepLabel = (kind, id) => KIND_STEPS[kind === 'make' ? 'make' : 'buy'][Math.max(0, ['idea', 'started', 'have', 'wrapped'].indexOf(id))];
export const LEGACY_STATUS = { bought: 'have', given: 'wrapped' };
export const STATUS_IDS = STATUSES.map(s => s.id);
export const CATEGORIES = ['Shopping', 'Decorating', 'Food', 'Cards', 'Events', 'Other'];
export const COLORS = ['#173B2F', '#2F7D5B', '#1E6F86', '#3B4F9A', '#6D3F8F', '#A3264A', '#C8243F', '#B8782A'];
export const EMOJIS = ['', '🎅', '🤶', '👶', '👧', '👦', '👩', '👨', '👵', '👴', '🐶', '🐱', '⭐️', '❄️', '🦌', '⛄️', '🎄', '🍪', '🔔', '🧸', '🎁', '🕯️', '🎿', '🎮'];

/* Event types. Each has its own wrapping-paper theme (see .th-* in the CSS). */
export const EVENT_TYPES = ['birthday', 'christmas', 'anniversary', 'celebration'];
export const THEMES = {
  birthday: { label: 'Birthday', icon: 'cake' },
  christmas: { label: 'Christmas', icon: 'tree' },
  anniversary: { label: 'Anniversary', icon: 'rings' },
  celebration: { label: 'Celebration', icon: 'sparkle' },
};

export const blank = () => ({ version: 3, updatedAt: 0, people: [], gifts: [], tasks: [], occasions: [], deleted: {}, household: { on: false, mod: 0 } });
export const KINDS = ['people', 'gifts', 'tasks', 'occasions'];
