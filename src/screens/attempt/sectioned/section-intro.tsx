import {
  CircleX,
  Clock,
  CloudOff,
  Flag,
  Lock,
  type LucideIcon,
  CirclePause,
  Play,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SessionState } from '@/attempt-engine/types';
import { BrandCard } from '@/components/app/brand';
import { IconTile, TONES } from '@/components/app/icon-tile';
import { ActionBar } from '@/components/app/top-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { dispatchAttempt } from '@/stores/attempt-sessions';

/** Before the first section: the format and the rules, then "start". */
export function SectionIntro({
  state,
  sectionTitle,
}: {
  state: SessionState;
  sectionTitle: (order: number) => string;
}) {
  const { t } = useTranslation();
  const first = state.sections[0];
  const rules: { icon: LucideIcon; text: string }[] = [
    { icon: Clock, text: t('sectioned.ruleClock') },
    { icon: CirclePause, text: t('sectioned.rulePause') },
    { icon: CircleX, text: t('sectioned.ruleEliminate') },
    { icon: Flag, text: t('sectioned.ruleFlag') },
    { icon: Lock, text: t('sectioned.ruleLock') },
    { icon: CloudOff, text: t('sectioned.ruleOffline') },
  ];

  return (
    <>
      <div className="flex flex-col gap-4 pt-4 pb-4">
        <BrandCard className="text-on-brand">
          <p className="text-sm font-medium text-on-brand-muted">
            {t('sectioned.introEyebrow', { count: state.sections.length })}
          </p>
          <div className="flex flex-col gap-2">
            {state.sections.map((section) => (
              <div
                key={section.order}
                className="flex items-center gap-3 rounded-2xl bg-on-brand-subtle px-3 py-2.5"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-on-brand text-xs font-semibold text-brand-end">
                  {section.order}
                </span>
                <span className="flex-1 truncate font-medium">{sectionTitle(section.order)}</span>
                <span className="text-sm text-on-brand-muted">
                  {t('home.minutes', { count: Math.round(section.budgetMs / 60_000) })}
                </span>
              </div>
            ))}
          </div>
          {state.breakMinutes === null ? null : (
            <p className="text-sm text-on-brand-muted">
              {t('sectioned.breakBetween', { count: state.breakMinutes })}
            </p>
          )}
        </BrandCard>
        <Card className="flex flex-col gap-4">
          <p className="font-semibold">{t('sectioned.rulesTitle')}</p>
          {rules.map((rule, index) => (
            <div key={rule.text} className="flex items-center gap-3">
              <IconTile icon={rule.icon} tone={TONES[index % TONES.length]!} size="sm" />
              <p className="flex-1 text-sm leading-5">{rule.text}</p>
            </div>
          ))}
        </Card>
      </div>
      <ActionBar>
        <Button
          variant="brand"
          size="lg"
          className="flex-1"
          onClick={() => {
            if (first) {
              dispatchAttempt(state.attemptId, { type: 'SECTION_START', sectionOrder: first.order });
            }
          }}
        >
          <Play className="fill-current" />
          {t('sectioned.startSection', { title: first ? sectionTitle(first.order) : '' })}
        </Button>
      </ActionBar>
    </>
  );
}
