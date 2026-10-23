import { createContext, useContext, type ReactNode } from 'react'
import { Box } from './layout'

// Desktop window frame primitives. On macOS the app content reaches the top
// edge and the system draws its own controls over it (hidden-inset title bar);
// Windows and Linux keep their native frame, so these primitives are inert
// there and nothing is painted on top of the system bar.

/** 52×20px: three 12px controls with 8px gaps. */
export const WINDOW_CONTROLS_SLOT = { width: 52, height: 20 } as const

/** The reserved slot for the macOS traffic lights: 52×20px (three 12px
 * controls with 8px gaps). The system draws the controls; this box only
 * reserves their space and keeps them out of the tab order. */
export function WindowControlsSlot() {
  return <Box width={WINDOW_CONTROLS_SLOT.width} height={WINDOW_CONTROLS_SLOT.height} flexShrink={0} aria-hidden />
}

/** A strip that drags the desktop window. On the web the attribute is inert;
 * in the Tauri webview `data-tauri-drag-region` turns the strip into a native
 * drag handle while nested controls keep their own hit area and clicks. It is
 * not a control: no role, no tab stop. */
export function WindowDragArea({ children, height }: { children?: ReactNode; height?: number }) {
  return (
    <Box dragRegion {...(height !== undefined ? { height } : null)}>
      {children}
    </Box>
  )
}

const WindowChromeContext = createContext(false)

/** Tells the columns of the app that the window has the macOS hidden-inset title bar: they reserve the controls slot and mark their top strip as a drag area. Windows and Linux keep the native frame and do not use it. */
export function WindowChromeProvider({ macos, children }: { macos: boolean; children: ReactNode }) {
  return <WindowChromeContext.Provider value={macos}>{children}</WindowChromeContext.Provider>
}

/** True inside the macOS desktop window. */
export function useWindowChrome(): boolean {
  return useContext(WindowChromeContext)
}
