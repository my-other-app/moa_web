# The controls

One set of controls, written once in `packages/ui`, used by every screen in the clubs and admin apps. A screen composes them; it never restyles them. If a screen needs a control that is not here, add it here.

## Buttons

One stylesheet (`.btn` in `meridian.css`) and one component (`<Button>`) that emits those classes, so a `<Button>` and a `<Link className="btn btn-secondary">` are the same control to the pixel.

| size | class | height | use |
| --- | --- | --- | --- |
| xs | `btn-xs` | 28px | a row's small action |
| sm | `btn-sm` | 32px | a panel's action, a notice's action |
| md | none | 36px | a page's action (default) |
| lg | `btn-lg` | 44px | a touch screen: gate, kiosk |

| tone | class | use |
| --- | --- | --- |
| primary | `btn-primary` | the one thing the page is for; brand fill |
| secondary | `btn-secondary` | everything else; surface with a line |
| ghost | `btn-ghost` | a quiet, link-like action; brand text |
| quiet | `btn-quiet` | an icon button in a row; ink, no line |
| destructive | `btn-destructive` | the one that removes; refuse fill |

Add `btn-danger` to a secondary or ghost button whose action removes something (refuse text). Add `btn-icon` for a square icon-only button, `btn-round` to make it round. Nothing else sets a button's height, padding, radius or type: never `h-8 px-2 text-[12px]`.

`<IconButton label="Copy">` is the icon-only button for a row: round, 32px, a line around it, with the label as its accessible name and tooltip. `variant="quiet"` is the one for a dense row (a layer list): ink, no line, 28px with `size="xs"`.

`<IconToggle on labelOn labelOff iconOn iconOff onToggle>` is a square icon toggle whose icon says the state and whose label says what pressing it does: an open eye to hide, a crossed eye to show; an open lock to hold in place, a closed lock (caution) to release. Never a glyph character, never a filled or empty box.

## Fields

`.input` is the field: 36px, the field radius, a line that turns brand on focus. `.input-sm` is 32px for a field inside a row. A native `<select className="input">` draws its own chevron. `<NativeSelect>` is the same select as a component.

## Search

`<SearchField value onChange label>` is the search pill: 36px, on the sunken ground, with the icon. `onCommit` fires on Enter and blur for screens that search on commit. Width comes from the caller (`className="sm:w-56"`). `<SearchInput>` is the same pill, debounced, for screens that search as you type.

## Chips

`<Chip active onClick>` is a filter that is on or off: 32px, the chip radius, sentence case ("Checked in 12", never "CHECKED IN"). Brand when on. A `tone` colours the line when off so a caution or refuse filter reads as one.

## Choices

`<ChoiceCard checked onClick title hint right>` is one of a few choices as a card, lit when picked; put several in a `role="radiogroup"`. `<Segmented label value options onChange>` is two to four exclusive short choices in one 36px track.

## Toolbar

`<Toolbar>` is the row above a list inside a panel: chips on the left, `<ToolbarEnd>` for the search and the sort on the right.

## Tags and badges

`.tag` (mono, uppercase) is a label, not a control. `<StatusBadge>` is a status. Neither is clickable; a clickable one is a chip.
