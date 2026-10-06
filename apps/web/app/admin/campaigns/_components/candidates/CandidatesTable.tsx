import RowActionsMenu from "@/components/ui/RowActionsMenu";
import type { Address, Candidate } from "@/lib/candidates/types";
import { t } from "@/lib/messages";
import { formatDate } from "@/lib/sessions/format";

type Props = {
  /** The rows to show: one page, already filtered and ordered by the server. */
  candidates: Candidate[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (candidate: Candidate) => void;
  onDelete: (candidate: Candidate) => void;
};

const text = t.candidates.list.table;

const HEAD = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";

// Wide screens get a table. Below `md` the same rows become stacked cards: each cell shows its column's name (from
// data-label) beside its value, so nothing is duplicated in the page and nothing scrolls sideways.
const CELL =
  "px-4 py-3.5 align-top text-sm text-ink max-md:flex max-md:gap-3 max-md:px-0 max-md:py-1 max-md:before:w-28 max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-semibold max-md:before:text-ink-muted max-md:before:content-[attr(data-label)]";

/** "Tonle Basak, Chamkar Mon, Phnom Penh": the smallest place first, the way an address is written. */
export function addressLine(address: Address): string {
  return [address.village, address.commune, address.district, address.province]
    .map((place) => place?.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

/** The first letter of the English name, as a marker to help the eye find a row. Not read out. */
function Initial({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The campaign's candidates as a table, one row each, so a long list stays easy to scan. */
export default function CandidatesTable({ candidates, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto md:rounded-2xl md:border md:border-line md:bg-surface">
      {/* Explicit roles keep the table's meaning for assistive technology when the cards below `md` change its display. */}
      <table role="table" aria-label={t.candidates.list.listLabel} className="w-full border-collapse md:min-w-[64rem]">
        <thead role="rowgroup" className="max-md:sr-only border-b border-line bg-canvas">
          <tr role="row">
            <th role="columnheader" scope="col" className={HEAD}>{text.candidate}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.gender}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.born}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.phone}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.address}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.school}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.session}</th>
            <th role="columnheader" scope="col" className={HEAD}>{text.ngo}</th>
            <th role="columnheader" scope="col" className={HEAD}><span className="max-md:sr-only">{text.actions}</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-md:flex max-md:flex-col max-md:gap-3 md:divide-y md:divide-line">
          {candidates.map((candidate) => {
            const cancelled = candidate.session?.status === "Cancelled";
            return (
              <tr
                key={candidate.id}
                role="row"
                className="transition-colors duration-150 hover:bg-canvas/70 max-md:relative max-md:block max-md:rounded-2xl max-md:border max-md:border-line max-md:bg-surface max-md:p-4"
              >
                <td role="cell" className={`${CELL} max-w-64 max-md:max-w-none max-md:pr-10 max-md:before:hidden`}>
                  <div className="flex items-center gap-3">
                    <Initial name={candidate.nameEn} />
                    <div className="min-w-0">
                      <span className="block font-semibold">{candidate.nameEn}</span>
                      <span lang="km" className="block text-ink-muted">{candidate.nameKm}</span>
                    </div>
                  </div>
                </td>
                <td role="cell" data-label={text.gender} className={CELL}>{t.candidates.form.genders[candidate.gender]}</td>
                <td role="cell" data-label={text.born} className={`${CELL} whitespace-nowrap`}>{formatDate(candidate.dateOfBirth)}</td>
                <td role="cell" data-label={text.phone} className={`${CELL} whitespace-nowrap tabular-nums`}>{candidate.phone}</td>
                <td role="cell" data-label={text.address} className={`${CELL} max-w-64 break-words`}>{addressLine(candidate.address)}</td>
                <td role="cell" data-label={text.school} className={`${CELL} max-w-56 break-words`}>{candidate.schoolName}</td>
                <td role="cell" data-label={text.session} className={`${CELL} max-w-56`}>
                  {candidate.session ? (
                    <div>
                      <span className={cancelled ? "text-ink-muted line-through" : "font-semibold"}>{candidate.session.title}</span>
                      {cancelled ? (
                        <span className="mt-1 block w-fit rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-ink">{text.sessionCancelled}</span>
                      ) : (
                        <span className="block text-ink-muted">{candidate.session.date ? formatDate(candidate.session.date) : ""}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-muted">{text.notSet}</span>
                  )}
                </td>
                <td role="cell" data-label={text.ngo} className={`${CELL} max-w-48 break-words`}>
                  {candidate.hasNgoSupport ? (
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{candidate.ngoName}</span>
                  ) : (
                    <span className="text-ink-muted">{text.noNgo}</span>
                  )}
                </td>
                <td role="cell" className={`${CELL} w-px max-md:absolute max-md:right-2 max-md:top-3 max-md:w-auto max-md:p-0 max-md:before:hidden`}>
                  <RowActionsMenu
                    label={text.actionsFor(candidate.nameEn)}
                    actions={[
                      ...(canEdit ? [{ label: text.edit, onSelect: () => onEdit(candidate) }] : []),
                      ...(canDelete ? [{ label: text.delete, onSelect: () => onDelete(candidate) }] : []),
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
