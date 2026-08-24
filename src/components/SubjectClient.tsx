'use client';

import { useClasses } from '@/hooks/useClasses';
import { useAuth } from '@/hooks/useAuth';
import ClassTabs from '@/components/ClassTabs';
import CurriculumTree from '@/components/CurriculumTree';
import type { Predmet } from '@/types/curriculum';

function getRazredFilter(name: string): number | null {
  const m = name.match(/[6-9]/);
  return m ? Number(m[0]) : null;
}

export default function SubjectClient({ predmet, gradeTargets, scopeId, subtitle }: {
  predmet: Predmet;
  gradeTargets: Record<number, number>;
  /** ločen prostor za oddelke (id instance predmeta); privzeto id kurikula */
  scopeId?: string;
  subtitle?: string;
}) {
  const { classes, activeId, addClass, renameClass, removeClass, selectClass, reorderClasses, activeClass } = useClasses(scopeId ?? predmet.id);
  const { user, loading } = useAuth();
  const isAnonymous = !loading && !user;
  const razredFilter = activeClass ? getRazredFilter(activeClass.name) : null;
  const classBar = (
    <ClassTabs
      classes={classes}
      activeId={activeId}
      onSelect={selectClass}
      onAdd={addClass}
      onRename={renameClass}
      onDelete={removeClass}
      onReorder={reorderClasses}
      isAnonymous={isAnonymous}
    />
  );
  return (
    <CurriculumTree
      key={activeId ?? 'default'}
      predmet={predmet}
      classId={activeId ?? undefined}
      razredFilter={razredFilter}
      classBar={classBar}
      isAnonymous={isAnonymous}
      gradeTargets={gradeTargets}
      subtitle={subtitle}
    />
  );
}
