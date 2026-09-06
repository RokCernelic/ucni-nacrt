'use client';

import Link from 'next/link';
import { useMasterClasses } from '@/hooks/useMasterClasses';
import { useViewClasses } from '@/hooks/useViewClasses';
import { useAuth } from '@/hooks/useAuth';
import ViewClassTabs from '@/components/ViewClassTabs';
import CurriculumTree from '@/components/CurriculumTree';
import type { Predmet } from '@/types/curriculum';

function getRazredFilter(name: string): number | null {
  const m = name.match(/[6-9]/);
  return m ? Number(m[0]) : null;
}

export default function SubjectClient({ predmet, gradeTargets, scopeId, subtitle }: {
  predmet: Predmet;
  gradeTargets: Record<number, number>;
  scopeId?: string;
  subtitle?: string;
}) {
  const subjectId = scopeId ?? predmet.id;
  const { classes: master } = useMasterClasses();
  const { ids, activeId, setActive, addToView, removeFromView } = useViewClasses('ucni', subjectId);
  const { user, loading } = useAuth();
  const isAnonymous = !loading && !user;

  const activeClass = master.find(m => m.id === activeId) ?? null;
  const razredFilter = activeClass ? getRazredFilter(activeClass.name) : null;
  const scope = activeId ? `${subjectId}::${activeId}` : undefined;

  const classBar = isAnonymous ? (
    <div style={{ marginTop: '18px' }}>
      <Link href="/login" style={{ background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.25)', borderRadius: '6px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-sans)', fontSize: '12px', padding: '5px 12px', textDecoration: 'none' }}>
        + Prijava za razrede
      </Link>
    </div>
  ) : (
    <ViewClassTabs
      master={master}
      ids={ids}
      activeId={activeId}
      onSelect={setActive}
      onAdd={addToView}
      onRemove={removeFromView}
    />
  );

  return (
    <CurriculumTree
      key={scope ?? 'default'}
      predmet={predmet}
      classId={scope}
      razredFilter={razredFilter}
      classBar={classBar}
      isAnonymous={isAnonymous}
      gradeTargets={gradeTargets}
      subtitle={subtitle}
      fullscreenHref={`/predmet/${subjectId}/ura`}
    />
  );
}
