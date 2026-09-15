// Video Player Components - Central Export
export { default as EndScreenOverlay } from './EndScreenOverlay';

// Ghost-masked player with custom controls (recommended)
export { default as MahimaGhostPlayer } from './MahimaGhostPlayer';

// Bunny.net Stream player (premium embed)
export { default as BunnyStreamPlayer } from './BunnyStreamPlayer';
export { isBunnyStreamUrl, parseBunnyStreamUrl } from './BunnyStreamPlayer';

// Unified multi-platform player
export { default as UnifiedVideoPlayer } from './UnifiedVideoPlayer';

// Safety net — wraps any player surface, recovers from runtime crashes.
export { default as PlayerErrorBoundary } from './PlayerErrorBoundary';

