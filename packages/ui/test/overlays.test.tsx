import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import {
  Dialog,
  Drawer,
  Icon,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger,
  UiProvider,
} from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

function MenuPopover({ onSelect = () => {} }: { onSelect?: () => void }) {
  return (
    <Popover>
      <PopoverTrigger>
        <button>Status</button>
      </PopoverTrigger>
      <PopoverContent role="menu" label="Change status">
        <Menu label="Change status">
          <MenuLabel>Status</MenuLabel>
          <MenuItem label="Open" current onSelect={onSelect} />
          <MenuItem label="Pending" onSelect={onSelect} />
          <MenuItem label="Locked" disabled onSelect={onSelect} />
          <MenuSeparator />
          <MenuItem label="Delete" destructive onSelect={onSelect} />
        </Menu>
      </PopoverContent>
    </Popover>
  )
}

describe('Popover', () => {
  it('is closed until the trigger is pressed and reports its state', () => {
    renderUi(<MenuPopover />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    expect(screen.queryByRole('menu', { name: 'Change status' })).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Change status' })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes with esc and returns focus to the trigger', () => {
    renderUi(<MenuPopover />)
    const trigger = screen.getByRole('button', { name: 'Status' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryAllByRole('menu').length).toBe(0)
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on a press outside but not inside', () => {
    renderUi(
      <>
        <MenuPopover />
        <p>elsewhere</p>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.pointerDown(screen.getByRole('menu', { name: 'Change status' }))
    expect(screen.getAllByRole('menu').length).toBeGreaterThan(0)
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(screen.queryAllByRole('menu').length).toBe(0)
  })

  it('works as a controlled component', () => {
    const onOpenChange = vi.fn()
    renderUi(
      <Popover open onOpenChange={onOpenChange}>
        <PopoverTrigger>
          <button>Open</button>
        </PopoverTrigger>
        <PopoverContent label="Details">body</PopoverContent>
      </Popover>,
    )
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Menu', () => {
  it('moves between enabled items with the arrow keys, skipping disabled ones', () => {
    renderUi(<MenuPopover />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    const items = screen.getAllByRole('menuitem')
    items[0]!.focus()
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.keyDown(items[3]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: 'End' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.keyDown(items[3]!, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
  })

  it('selects an enabled item and ignores a disabled one', () => {
    const onSelect = vi.fn()
    renderUi(<MenuPopover onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pending' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    const locked = screen.getByRole('menuitem', { name: 'Locked' })
    expect(locked.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(locked)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('marks the current option', () => {
    renderUi(<MenuPopover />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    expect(screen.getByRole('menuitem', { name: 'Open' }).getAttribute('aria-current')).toBe('true')
  })
})

function DialogHarness({ dirty = false, onChange = () => {} }: { dirty?: boolean; onChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onChange(next)
        }}
        title="Correct the classification"
        dirty={dirty}
        footer={<button>Save</button>}
      >
        <input aria-label="Name" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('is a labelled modal dialog', () => {
    renderUi(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = screen.getByRole('dialog', { name: 'Correct the classification' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('moves focus to the first control, not the close button', () => {
    renderUi(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })

  it('traps Tab inside and returns focus to the trigger on close', () => {
    renderUi(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes with the close button', () => {
    const onChange = vi.fn()
    renderUi(<DialogHarness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('closes on a scrim press only when there are no unsaved changes', () => {
    const clean = renderUi(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const scrim = screen.getByRole('dialog').parentElement!
    fireEvent.click(scrim)
    expect(screen.queryByRole('dialog')).toBeNull()
    clean.unmount()

    renderUi(<DialogHarness dirty />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('does not close when the press starts inside the panel', () => {
    renderUi(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('lets esc close only the top-most layer', () => {
    renderUi(
      <Dialog open onOpenChange={() => {}} title="Outer">
        <MenuPopover />
      </Dialog>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryAllByRole('menu').length).toBe(0)
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy()
  })
})

describe('Drawer', () => {
  it('is a labelled modal that slides in and closes from the scrim', () => {
    const onOpenChange = vi.fn()
    renderUi(
      <Drawer open onOpenChange={onOpenChange} title="History">
        <p>events</p>
      </Drawer>,
    )
    const drawer = screen.getByRole('dialog', { name: 'History' })
    expect(drawer.getAttribute('aria-modal')).toBe('true')
    expect(drawer.className).toContain('kairo-ui-slide')
    fireEvent.click(drawer.parentElement!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes with esc and with the close button', () => {
    const onOpenChange = vi.fn()
    renderUi(
      <Drawer open onOpenChange={onOpenChange} title="History" closeLabel="Cerrar">
        <p>events</p>
      </Drawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('renders nothing when closed', () => {
    renderUi(<Drawer open={false} onOpenChange={() => {}} title="History" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = renderUi(<Icon name="mail" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path,rect,circle,line,polyline').length).toBeGreaterThan(0)
  })

  it('becomes an image with an accessible name when labelled', () => {
    renderUi(<Icon name="lock" label="Team only" />)
    expect(screen.getByRole('img', { name: 'Team only' })).toBeTruthy()
  })

  it('draws the spark filled and everything else as a line icon', () => {
    const spark = renderUi(<Icon name="spark" />).container.querySelector('svg')!
    expect(spark.getAttribute('fill')).not.toBe('none')
    cleanup()
    const line = renderUi(<Icon name="check" size={20} />).container.querySelector('svg')!
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.getAttribute('stroke')).toBe('currentColor')
    expect(line.getAttribute('width')).toBe('20')
  })

  it('uses a heavier stroke at small sizes', () => {
    const small = renderUi(<Icon name="x" size={12} />).container.querySelector('svg')!
    cleanup()
    const large = renderUi(<Icon name="x" size={16} />).container.querySelector('svg')!
    expect(Number(small.getAttribute('stroke-width'))).toBeGreaterThan(Number(large.getAttribute('stroke-width')))
  })
})
