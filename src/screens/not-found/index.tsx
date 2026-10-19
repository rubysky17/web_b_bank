import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { FeatureIcon } from '@/components/app/icon-tile';
import { Button } from '@/components/ui/button';

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <FeatureIcon icon={FileQuestion} />
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <Button asChild variant="brand">
        <Link to="/">{t('common.goHome')}</Link>
      </Button>
    </div>
  );
}
