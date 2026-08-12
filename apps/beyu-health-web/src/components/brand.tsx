export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white font-bold text-sm">B</div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-widest text-navy-900 dark:text-white">BEYU</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">Health OS</span>
        </div>
      )}
    </div>
  );
}
