'use client';

import { useClasses } from '@/hooks/useClasses';
import { useAuth } from '@/hooks/useAuth';
import ClassTabs from '@/components/ClassTabs';
import CurriculumTree from '@/components/CurriculumTree';
import { fizika } from '@/data/fizika';

function getRazredFilter(name: string): number | null {
  if (/8/.test(name)) return 8;
  if (/9/.test(name)) return 9;
  return null;
}

export default function FizikaClient() {
  const { classes, activeId, addClass, renameClass, removeClass, selectClass, reorderClasses, activeClass } = useClasses();
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
      predmet={fizika}
      classId={activeId ?? undefined}
      razredFilter={razredFilter}
      classBar={classBar}
      isAnonymous={isAnonymous}
    />
  );
}
