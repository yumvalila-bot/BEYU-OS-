/**
 * Brand mark.
 *
 * The specification requires the owner's canonical BEYU logo, which has not
 * been supplied to this repository. Inventing one would be wrong: a logo is a
 * legal identity asset of BEYU FAMILY TRUST, not a design detail for an
 * implementer to fill in.
 *
 * What renders here is an explicit, neutral placeholder — a gold-ruled
 * monogram in the brand palette — so that the shell has correct spacing and
 * hierarchy for the real asset. Replacing it is a single file change: drop
 * the supplied file into public/ and swap this component for an <Image>.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-md border border-accent/40 bg-accent/10 font-semibold tracking-tight text-accent"
    >
      <span style={{ fontSize: size * 0.42 }}>B</span>
    </span>
  );
}

export function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-ink">BEYU OS</div>
        <div className="text-[11px] uppercase tracking-wider text-ink-subtle">
          BEYU Family Trust
        </div>
      </div>
    </div>
  );
}
