type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: { overlaysContent: boolean };
};

export function initVirtualKeyboard(): void {
  const keyboard = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
  if (!keyboard) return;
  keyboard.overlaysContent = true;
}
