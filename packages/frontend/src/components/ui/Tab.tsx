import { TabButton } from './TabButton';
import type { TabButtonProps } from './TabButton';

export interface TabProps extends TabButtonProps {}

export const Tab: React.FC<TabProps> = ({
  size = 'md',
  tabVariant = 'secondary',
  ...props
}) => <TabButton size={size} tabVariant={tabVariant} {...props} />;

export default Tab;
