/** The one <audio> element of the app. Its own module (no imports) so the engine and the audio graph can both use it without a cycle. */
export const audio = new Audio();
audio.crossOrigin = 'anonymous';
