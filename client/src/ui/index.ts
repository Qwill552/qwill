/** UI-примитивы. Каждый — на токенах: цвет, прозрачность, размытие и тени берутся только
 *  из переменных, поэтому переключение Стекло ↔ Строгий их не касается.
 *
 *  Три класса поверхностей (ux-ui/design-system.md):
 *    chrome  — ChromeBar, GlassButton, GlassPill, FAB, TabBar. Размывают подложку.
 *    card    — Card, Chip, SearchField. Едут вместе с контентом, не размывают.
 *    overlay — Sheet, Menu. Размывают. */
export { Avatar } from './Avatar';
export { Badge } from './Badge';
export { Card } from './Card';
export { Chip } from './Chip';
export { FAB } from './FAB';
export { Icon, type IconName } from './Icon';
export { IconButton } from './IconButton';
export { IconTile, type TileTint } from './IconTile';
export { Menu, type MenuItem } from './Menu';
export { Ripple } from './Ripple';
export { ScrollIndicator } from './ScrollIndicator';
export { SearchField } from './SearchField';
export { SegmentedControl, type Segment } from './SegmentedControl';
export { Sheet } from './Sheet';
export { Skeleton } from './Skeleton';
export { Spinner } from './Spinner';
export { Switch } from './Switch';
export { ChromeBar } from './chrome/ChromeBar';
export { GlassButton } from './chrome/GlassButton';
export { GlassPill } from './chrome/GlassPill';
