import React from 'react';
import { Card } from './Card';
import type { CardVariant } from './Card';

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: CardVariant;
  className?: string;
  children?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  actions,
  variant = 'outlined',
  className = '',
  children,
}) => {
  if (!title && !description && !actions) {
    return (
      <Card variant={variant} className={className}>
        {children}
      </Card>
    );
  }

  return (
    <Card variant={variant} className={className}>
      <Card.Header>
        <div className="flex-1 min-w-0">
          {title && <Card.Title>{title}</Card.Title>}
          {description && <Card.Description>{description}</Card.Description>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {actions}
          </div>
        )}
      </Card.Header>
      {children && <Card.Body>{children}</Card.Body>}
    </Card>
  );
};

Section.displayName = 'Section';

export default Section;
